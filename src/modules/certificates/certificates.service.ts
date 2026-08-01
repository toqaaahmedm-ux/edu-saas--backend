import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { CertificatesRepository } from './certificates.repository';
import { PrismaService } from '../../prisma/prisma.service';

// FIX #24: قاعدة واحدة مركزية للإصدار — نجاح الكويز + اكتمال الكورس
const PASSING_SCORE = 70;
const REQUIRED_PROGRESS = 100;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly certificatesRepository: CertificatesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getMyCertificates(tenantId: string, studentId: string) {
    return this.certificatesRepository.findByStudentId(tenantId, studentId);
  }

  // BE-C05 FIX: قبل كده findById كانت بترجع أي شهادة بالـ id من غير أي
  // تحقق — أي مستخدم مصادق (وحتى endpoint مكشوف بدون auth خالص) كان
  // يقدر يشوف بيانات شخصية لطالب تاني (اسم، إيميل، اسم الكورس...).
  // دلوقتي بنتحقق من حاجتين بالترتيب:
  //  1. الشهادة تبع نفس المستأجر (tenantId) — لو لأ نرمي NotFoundException
  //     بدل ForbiddenException عشان منكشفش إن الشهادة موجودة عند مستأجر تاني.
  //  2. صاحب الطلب هو الطالب نفسه، أو ADMIN/TEACHER في نفس المستأجر —
  //     غير ذلك نرمي ForbiddenException.
  async findById(
    id: string,
    tenantId: string,
    requestUserId: string,
    requestUserRole: string,
  ) {
    const cert = await this.certificatesRepository.findById(id);
    if (!cert || cert.tenantId !== tenantId) {
      throw new NotFoundException('Certificate not found');
    }

    const isOwner = cert.studentId === requestUserId;
    const isStaff = requestUserRole === 'ADMIN' || requestUserRole === 'TEACHER';
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You do not have access to this certificate');
    }

    return cert;
  }

  // FIX #24: helper مشترك للتحقق من الشروط
  private async assertEligible(studentId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to get a certificate');
    }
    // FIX #24: نفس الـ threshold في المسارين
    if (enrollment.progress < REQUIRED_PROGRESS) {
      throw new BadRequestException(
        `Course not completed — progress must reach ${REQUIRED_PROGRESS}%`,
      );
    }
    return enrollment;
  }

  async create(
    tenantId: string,
    studentId: string,
    courseId: string,
    data: {
      examName: string;
      institutionName: string;
      facultyName: string;
    },
  ) {
    // FIX #24: استخدام الـ helper المشترك
    await this.assertEligible(studentId, courseId);

    const existing = await this.certificatesRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) throw new ConflictException('Certificate already issued');

    return this.certificatesRepository.create({
      tenantId,
      studentId,
      courseId,
      ...data,
    });
  }

  async issueIfPassed(
    tenantId: string,
    studentId: string,
    courseId: string,
    score: number,
    passingScore: number = PASSING_SCORE,
  ) {
    if (score < passingScore) return null;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) return null;

    // FIX #24: الإصدار التلقائي بيتحقق من التقدم زي الإصدار اليدوي
    if (enrollment.progress < REQUIRED_PROGRESS) return null;

    const existing = await this.certificatesRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) return existing;

    // PDF-FIX: كان بيستقبل الـ score كـ parameter بس مش بيحفظه أبدًا في
    // الشهادة — دلوقتي بنمرره فعليًا عشان يظهر في شهادة الـ PDF.
    return this.certificatesRepository.create({
      tenantId,
      studentId,
      courseId,
      examName: 'General Exam',
      institutionName: 'EduSaaS',
      facultyName: 'Online Learning',
      score,
    });
  }

  // ─── PDF Generation (Puppeteer) ─────────────────────────────────────

  private getGradeText(score: number, lang: 'en' | 'ar'): string {
    if (lang === 'ar') {
      if (score >= 90) return 'بامتياز مع مرتبة الشرف';
      if (score >= 80) return 'بتقدير جيد جدًا';
      if (score >= 65) return 'بتقدير جيد';
      return 'بتقدير مقبول';
    }
    if (score >= 90) return 'with Distinction & Honors';
    if (score >= 80) return 'with Very Good Standing';
    if (score >= 65) return 'with Good Standing';
    return 'with Satisfactory Standing';
  }

  // بيبني نفس تصميم الـ Certificate.tsx بالضبط لكن كـ HTML/CSS ثابت
  // (بدون Tailwind) عشان يترندر بشكل مضمون جوه Puppeteer.
  private buildCertificateHtml(cert: any, lang: 'en' | 'ar'): string {
    const isAr = lang === 'ar';
    const dir = isAr ? 'rtl' : 'ltr';
    const name = cert.student?.name || 'Student';
    const dateLocale = isAr ? 'ar-EG' : 'en-US';
    const issuedDate = new Date(cert.issuedAt).toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const labels = isAr
      ? {
          certificate: 'شهادة',
          certifies: 'تشهد إدارة المنصة التعليمية بأن',
          passed: 'قد اجتاز(ت) بنجاح امتحان',
          totalScore: 'بمجموع درجات',
          completed: 'قد أكمل(ت) بنجاح المقرر',
          dateOfIssue: 'تاريخ الإصدار',
          authorizedSignature: 'التوقيع المعتمد',
          director: 'مدير EduSaaS',
          officialSeal: 'الختم الرسمي',
        }
      : {
          certificate: 'CERTIFICATE',
          certifies: 'The educational platform administration hereby certifies that',
          passed: 'has successfully passed the',
          totalScore: 'with a total score of',
          completed: 'has successfully completed the course',
          dateOfIssue: 'Date of Issue',
          authorizedSignature: 'Authorized Signature',
          director: 'EduSaaS Director',
          officialSeal: 'Official Seal',
        };

    // PDF-FIX: الشهادات القديمة ممكن ما يكونش عندها score محفوظ (null).
    // لو موجود بنعرض الدرجة والتقدير، لو مش موجود بنعرض جملة إكمال عامة
    // بدل ما نعرض "undefined%" أو نكسر التصميم.
    const scoreBlockHtml =
      cert.score !== null && cert.score !== undefined
        ? `<p class="body-text">${labels.passed} <b>${cert.examName}</b> examination<br/>
           <span class="grade">${this.getGradeText(cert.score, lang)}</span> ${labels.totalScore}
           <span class="score">${cert.score}%</span></p>`
        : `<p class="body-text">${labels.completed} <b>${cert.examName}</b></p>`;

    return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
  .cert-outer {
    width: 800px; height: 560px; padding: 20px;
    background: #ffffff; border: 16px solid #1e3a8a;
    position: relative; display: flex; flex-direction: column;
    justify-content: space-between; overflow: hidden;
  }
  .watermark {
    position: absolute; inset: 0; opacity: 0.03;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .watermark h1 {
    font-size: 100px; font-weight: 900; transform: rotate(-12deg);
    letter-spacing: 6px; color: #1e3a8a;
  }
  .cert-inner {
    border: 3px solid #ca8a04; height: 100%; padding: 24px;
    display: flex; flex-direction: column; align-items: center;
    text-align: center; position: relative; z-index: 10;
  }
  .header-row {
    display: flex; justify-content: space-between; width: 100%;
    align-items: center; margin-bottom: 24px; padding: 0 16px;
  }
  .header-side { line-height: 1.2; }
  .header-side.left { text-align: ${isAr ? 'right' : 'left'}; }
  .header-side.right { text-align: ${isAr ? 'left' : 'right'}; }
  .header-side p.inst { font-size: 11px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; }
  .header-side p.fac { font-size: 9px; color: #6b7280; font-style: italic; font-weight: 500; }
  .seal-badge {
    width: 64px; height: 64px; background: #1e3a8a; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 900; font-size: 20px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 2px solid rgba(202,138,4,0.3);
  }
  h1.title {
    font-size: 36px; font-family: Georgia, serif; color: #1e3a8a;
    margin-bottom: 8px; letter-spacing: 6px; font-weight: 900;
    border-bottom: 2px solid rgba(30,58,138,0.1); padding-bottom: 4px;
  }
  p.subtitle { font-size: 14px; font-style: italic; color: #6b7280; margin-bottom: 16px; }
  h2.name {
    font-size: 36px; font-weight: 700; color: #1e293b;
    border-bottom: 2px solid #ca8a04; padding: 0 48px 8px; margin-bottom: 16px; min-width: 350px;
  }
  p.body-text { font-size: 18px; line-height: 1.6; color: #334155; margin-bottom: 24px; max-width: 550px; }
  .grade { color: #1d4ed8; font-weight: 700; font-style: italic; }
  .score { font-size: 30px; color: #ca8a04; font-weight: 900; }
  .footer-row {
    display: flex; justify-content: space-between; width: 100%;
    margin-top: auto; padding: 0 24px; align-items: flex-end;
  }
  .footer-col { text-align: center; }
  .footer-label { font-size: 9px; color: #9ca3af; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .footer-value {
    font-size: 12px; font-weight: 700; color: #1e293b;
    border-top: 1px solid #e2e8f0; padding-top: 8px; width: 144px;
  }
  .footer-value.signature { font-style: italic; color: #1e3a8a; font-family: Georgia, serif; }
  .seal-ring {
    width: 80px; height: 80px; border: 2px solid rgba(30,58,138,0.1);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transform: rotate(12deg); opacity: 0.4;
  }
  .seal-ring div { font-size: 8px; font-weight: 900; color: #1e3a8a; text-align: center; line-height: 1.2; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="cert-outer">
    <div class="watermark"><h1>EDUSAAS</h1></div>
    <div class="cert-inner">
      <div class="header-row">
        <div class="header-side left">
          <p class="inst">${cert.institutionName}</p>
          <p class="fac">${cert.facultyName}</p>
        </div>
        <div class="seal-badge">ASU</div>
        <div class="header-side right">
          <p class="inst">Medical SaaS</p>
          <p class="fac">E-Learning Platform</p>
        </div>
      </div>

      <h1 class="title">${labels.certificate}</h1>
      <p class="subtitle">${labels.certifies}</p>
      <h2 class="name">${name}</h2>
      ${scoreBlockHtml}

      <div class="footer-row">
        <div class="footer-col">
          <p class="footer-label">${labels.dateOfIssue}</p>
          <p class="footer-value">${issuedDate}</p>
        </div>
        <div class="seal-ring"><div>EduSaaS<br/>${labels.officialSeal}</div></div>
        <div class="footer-col">
          <p class="footer-label">${labels.authorizedSignature}</p>
          <p class="footer-value signature">${labels.director}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  // بيعيد استخدام findById بالكامل — يعني نفس الحماية بالظبط اللي في
  // GET /certificates/:id (فحص tenant + فحص إن صاحب الطلب هو الطالب
  // نفسه أو ADMIN/TEACHER)، فمفيش أي مسار جديد للوصول غير المصرح به.
  async generateCertificatePdf(
    id: string,
    tenantId: string,
    requestUserId: string,
    requestUserRole: string,
    lang: 'en' | 'ar' = 'en',
  ): Promise<Buffer> {
    const cert = await this.findById(id, tenantId, requestUserId, requestUserRole);
    const html = this.buildCertificateHtml(cert, lang);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        width: '840px',
        height: '600px',
        printBackground: true,
      });
      return Buffer.from(pdfBuffer);
    } finally {
      // مهم جدًا: لازم نقفل الـ browser دايمًا حتى لو حصل خطأ، عشان منسربش
      // عمليات Chromium على السيرفر (خطر حقيقي على AWS EC2 مع الوقت).
      await browser.close();
    }
  }
}