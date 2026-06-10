import { PrismaClient, Role, CourseStatus, EnrollmentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ─── 1. Clean up (order matters — dependents first) ──────────────
  await prisma.certificate.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  console.log("🧹 Cleaned existing data");

  // ─── 2. Users ─────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@edusaas.com",
      hashedPassword,
      role: Role.ADMIN,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Admin",
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      name: "Ahmed Hassan",
      email: "ahmed@edusaas.com",
      hashedPassword,
      role: Role.TEACHER,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Ahmed",
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      name: "Sara Mohamed",
      email: "sara@edusaas.com",
      hashedPassword,
      role: Role.TEACHER,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Sara",
    },
  });

  const student1 = await prisma.user.create({
    data: {
      name: "Omar Ali",
      email: "omar@edusaas.com",
      hashedPassword,
      role: Role.STUDENT,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Omar",
    },
  });

  const student2 = await prisma.user.create({
    data: {
      name: "Nour Khaled",
      email: "nour@edusaas.com",
      hashedPassword,
      role: Role.STUDENT,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Nour",
    },
  });

  console.log("👥 Created 5 users (1 admin, 2 teachers, 2 students)");

  // ─── 3. Courses ───────────────────────────────────────────────────
  const course1 = await prisma.course.create({
    data: {
      title: "مقدمة في JavaScript",
      description: "تعلم أساسيات JavaScript من الصفر حتى الاحتراف. شامل المتغيرات، الدوال، DOM، وأكثر.",
      category: "Programming",
      price: 0,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher1.id,
      thumbnail: "https://picsum.photos/seed/js/800/450",
    },
  });

  const course2 = await prisma.course.create({
    data: {
      title: "React من الصفر",
      description: "بناء تطبيقات ويب حديثة باستخدام React. Components، Hooks، State Management.",
      category: "Programming",
      price: 99.99,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher1.id,
      thumbnail: "https://picsum.photos/seed/react/800/450",
    },
  });

  const course3 = await prisma.course.create({
    data: {
      title: "تصميم UI/UX للمبتدئين",
      description: "أساسيات تصميم واجهات المستخدم وتجربة المستخدم. Figma، Color Theory، Typography.",
      category: "Design",
      price: 49.99,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher2.id,
      thumbnail: "https://picsum.photos/seed/uiux/800/450",
    },
  });

  const course4 = await prisma.course.create({
    data: {
      title: "Node.js وبناء APIs",
      description: "بناء RESTful APIs باستخدام Node.js وExpress. Authentication، Database، Deployment.",
      category: "Backend",
      price: 149.99,
      status: CourseStatus.DRAFT,
      instructorId: teacher2.id,
      thumbnail: "https://picsum.photos/seed/node/800/450",
    },
  });

  console.log("📚 Created 4 courses");

  // ─── 4. Lessons ───────────────────────────────────────────────────
  await prisma.lesson.createMany({
    data: [
      // Course 1 — JS
      { title: "ما هو JavaScript؟", videoUrl: "https://example.com/video/1", duration: 600, order: 1, courseId: course1.id },
      { title: "المتغيرات والأنواع", videoUrl: "https://example.com/video/2", duration: 900, order: 2, courseId: course1.id },
      { title: "الشروط والحلقات", videoUrl: "https://example.com/video/3", duration: 1200, order: 3, courseId: course1.id },
      { title: "الدوال (Functions)", videoUrl: "https://example.com/video/4", duration: 1500, order: 4, courseId: course1.id },
      { title: "التعامل مع DOM", videoUrl: "https://example.com/video/5", duration: 1800, order: 5, courseId: course1.id },
      // Course 2 — React
      { title: "لماذا React؟", videoUrl: "https://example.com/video/6", duration: 600, order: 1, courseId: course2.id },
      { title: "أول Component", videoUrl: "https://example.com/video/7", duration: 900, order: 2, courseId: course2.id },
      { title: "Props وState", videoUrl: "https://example.com/video/8", duration: 1200, order: 3, courseId: course2.id },
      { title: "useEffect Hook", videoUrl: "https://example.com/video/9", duration: 1500, order: 4, courseId: course2.id },
      // Course 3 — UI/UX
      { title: "مبادئ التصميم", videoUrl: "https://example.com/video/10", duration: 900, order: 1, courseId: course3.id },
      { title: "نظرية الألوان", videoUrl: "https://example.com/video/11", duration: 1200, order: 2, courseId: course3.id },
      { title: "التايبوغرافي", videoUrl: "https://example.com/video/12", duration: 900, order: 3, courseId: course3.id },
    ],
  });

  console.log("🎬 Created lessons");

  // ─── 5. Quizzes ───────────────────────────────────────────────────
  const quiz1 = await prisma.quiz.create({
    data: { title: "اختبار أساسيات JavaScript", timeLimit: 600, courseId: course1.id },
  });

  const quiz2 = await prisma.quiz.create({
    data: { title: "اختبار React Fundamentals", timeLimit: 900, courseId: course2.id },
  });

  const quiz3 = await prisma.quiz.create({
    data: { title: "اختبار UI/UX Basics", timeLimit: 480, courseId: course3.id },
  });

  console.log("📝 Created 3 quizzes");

  // ─── 6. Questions ─────────────────────────────────────────────────
  await prisma.question.createMany({
    data: [
      { text: "ما هو ناتج: typeof null ؟", options: ["null", "undefined", "object", "string"], correctIndex: 2, quizId: quiz1.id },
      { text: "أي من التالي يُستخدم لتعريف متغير ثابت في JS؟", options: ["var", "let", "const", "static"], correctIndex: 2, quizId: quiz1.id },
      { text: "ما الفرق بين == و === في JavaScript؟", options: ["لا فرق بينهما", "=== يقارن القيمة فقط", "=== يقارن القيمة والنوع معاً", "== يقارن النوع فقط"], correctIndex: 2, quizId: quiz1.id },
      { text: "ما ناتج: console.log(1 + '2') ؟", options: ["3", "'12'", "12", "Error"], correctIndex: 2, quizId: quiz1.id },
      { text: "أي method تُستخدم لإضافة عنصر في نهاية Array؟", options: ["push()", "pop()", "shift()", "unshift()"], correctIndex: 0, quizId: quiz1.id },
      { text: "ما هو ناتج: Boolean('') ؟", options: ["true", "false", "null", "undefined"], correctIndex: 1, quizId: quiz1.id },
      { text: "أي keyword تُستخدم لإنشاء دالة سهمية (arrow function)؟", options: ["function", "=>", "def", "lambda"], correctIndex: 1, quizId: quiz1.id },
      { text: "ما ناتج: [1,2,3].length ؟", options: ["2", "3", "4", "undefined"], correctIndex: 1, quizId: quiz1.id },
      { text: "أي method تُستخدم لتحويل JSON string إلى Object؟", options: ["JSON.stringify()", "JSON.parse()", "JSON.convert()", "JSON.toObject()"], correctIndex: 1, quizId: quiz1.id },
      { text: "ما هو ناتج: Math.floor(4.9) ؟", options: ["5", "4", "4.9", "Error"], correctIndex: 1, quizId: quiz1.id },
    ],
  });

  await prisma.question.createMany({
    data: [
      { text: "ما هو الـ JSX؟", options: ["JavaScript XML — طريقة لكتابة HTML داخل JavaScript", "نوع من أنواع الـ CSS", "مكتبة خارجية منفصلة عن React", "اختصار لـ JavaScript Extension"], correctIndex: 0, quizId: quiz2.id },
      { text: "ما الـ Hook المستخدم لإدارة الـ state في Functional Components؟", options: ["useEffect", "useState", "useContext", "useRef"], correctIndex: 1, quizId: quiz2.id },
      { text: "متى يعمل useEffect بـ empty dependency array [] ؟", options: ["عند كل render", "مرة واحدة فقط عند mount الـ component", "عند تغيير الـ props فقط", "لا يعمل أبداً"], correctIndex: 1, quizId: quiz2.id },
      { text: "ما الـ key الصحيح لإضافة class في JSX؟", options: ["class", "className", "classList", "htmlClass"], correctIndex: 1, quizId: quiz2.id },
      { text: "أي من التالي صحيح لتمرير props للـ component؟", options: ["<MyComp {name='Ahmed'} />", "<MyComp props={name:'Ahmed'} />", "<MyComp name='Ahmed' />", "<MyComp [name]='Ahmed' />"], correctIndex: 2, quizId: quiz2.id },
      { text: "ما وظيفة الـ key في قوائم React؟", options: ["تحديد ترتيب العناصر", "مساعدة React في تتبع التغييرات بكفاءة", "تحسين الـ CSS", "لا وظيفة لها"], correctIndex: 1, quizId: quiz2.id },
      { text: "ما الـ Hook المستخدم للوصول لـ Context؟", options: ["useState", "useEffect", "useContext", "useReducer"], correctIndex: 2, quizId: quiz2.id },
      { text: "كيف تمنع الـ form من تحديث الصفحة عند الـ submit؟", options: ["return false داخل الـ handler", "e.preventDefault() داخل الـ handler", "stopPropagation()", "لا يمكن منعه"], correctIndex: 1, quizId: quiz2.id },
    ],
  });

  await prisma.question.createMany({
    data: [
      { text: "ما الفرق بين UI وUX؟", options: ["لا فرق، هما نفس الشيء", "UI هو شكل الواجهة، UX هي تجربة المستخدم الكاملة", "UX هو شكل الواجهة، UI هي البرمجة", "UI للموبايل، UX للويب"], correctIndex: 1, quizId: quiz3.id },
      { text: "ما مبدأ Contrast في التصميم؟", options: ["استخدام نفس اللون في كل مكان", "إبراز العناصر المهمة بجعلها مختلفة بصرياً", "جعل كل العناصر بنفس الحجم", "تقليل عدد الألوان للصفر"], correctIndex: 1, quizId: quiz3.id },
      { text: "ما قاعدة 60-30-10 في التصميم؟", options: ["توزيع الألوان: 60% لون رئيسي، 30% ثانوي، 10% تمييز", "توزيع الوقت بين التصميم والبرمجة", "نسبة المحتوى للمسافات الفارغة", "عدد الألوان المسموح بها في التصميم"], correctIndex: 0, quizId: quiz3.id },
      { text: "ما الـ Wireframe؟", options: ["النسخة النهائية من التصميم", "مخطط هيكلي بسيط يوضح تخطيط الصفحة", "كود HTML للصفحة", "أنيميشن للواجهة"], correctIndex: 1, quizId: quiz3.id },
      { text: "ما مبدأ Gestalt في التصميم؟", options: ["استخدام الصور فقط بدون نصوص", "كيفية إدراك الدماغ للعناصر البصرية كمجموعات", "طريقة ترميز الألوان", "نوع من أنواع الـ Typography"], correctIndex: 1, quizId: quiz3.id },
      { text: "ما أفضل حجم للنص الأساسي (body text) على الويب؟", options: ["10-12px", "16-18px", "24-28px", "8-10px"], correctIndex: 1, quizId: quiz3.id },
    ],
  });

  console.log("❓ Created 24 questions across 3 quizzes");

  // ─── 7. Enrollments ───────────────────────────────────────────────
  await prisma.enrollment.createMany({
    data: [
      { studentId: student1.id, courseId: course1.id, progress: 80, status: EnrollmentStatus.ACTIVE },
      { studentId: student1.id, courseId: course2.id, progress: 40, status: EnrollmentStatus.ACTIVE },
      { studentId: student2.id, courseId: course1.id, progress: 100, status: EnrollmentStatus.COMPLETED },
      { studentId: student2.id, courseId: course3.id, progress: 60, status: EnrollmentStatus.ACTIVE },
    ],
  });

  console.log("🎓 Created 4 enrollments");

  // ─── 8. Quiz Attempts ─────────────────────────────────────────────
  await prisma.quizAttempt.createMany({
    data: [
      { studentId: student1.id, quizId: quiz1.id, score: 70, submittedAt: new Date() },
      { studentId: student2.id, quizId: quiz1.id, score: 90, submittedAt: new Date() },
    ],
  });

  console.log("📊 Created 2 quiz attempts");

  // ─── 9. Certificates ──────────────────────────────────────────────
  // FIX DB-02: include examName, institutionName, facultyName
  await prisma.certificate.create({
    data: {
      studentId: student2.id,
      courseId: course1.id,
      issuedAt: new Date(),
      examName: "اختبار أساسيات JavaScript",
      institutionName: "EduSaaS",
      facultyName: "Online Learning",
    },
  });

  console.log("🏆 Created 1 certificate");

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n✅ Seed completed successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👥 Users       : 5  (admin / 2 teachers / 2 students)");
  console.log("📚 Courses     : 4  (3 published, 1 draft)");
  console.log("🎬 Lessons     : 12");
  console.log("📝 Quizzes     : 3");
  console.log("❓ Questions   : 24");
  console.log("🎓 Enrollments : 4");
  console.log("📊 Attempts    : 2");
  console.log("🏆 Certificates: 1");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n🔑 Test credentials (all users):");
  console.log("   Password: password123");
  console.log("   Admin  : admin@edusaas.com");
  console.log("   Teacher: ahmed@edusaas.com / sara@edusaas.com");
  console.log("   Student: omar@edusaas.com  / nour@edusaas.com");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });