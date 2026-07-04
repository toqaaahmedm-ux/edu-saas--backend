import {
  PrismaClient,
  Role,
  CourseStatus,
  TenantStatus,
  BillingCycle,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ─── 1. Clean up ─────────────────────────────────────────────
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.planFeature.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.tenant.deleteMany();
  console.log("🧹 Cleaned existing data");

  // ─── 2. Plans ─────────────────────────────────────────────────
  const basicPlan = await prisma.plan.create({
    data: {
      name: "Basic",
      billingCycle: BillingCycle.MONTHLY,
      price: 199,
      currency: "EGP",
      maxStudents: 50,
      maxCourses: 5,
      maxStorageGb: 5,
      maxLiveHours: 0,
      features: {
        create: [
          { featureKey: "QUIZZES",       enabled: true  },
          { featureKey: "CERTIFICATES",  enabled: true  },
          { featureKey: "LIVE_LECTURES", enabled: false },
          { featureKey: "CUSTOM_DOMAIN", enabled: false },
          { featureKey: "ANALYTICS",     enabled: false },
        ],
      },
    },
  });

  const goldenPlan = await prisma.plan.create({
    data: {
      name: "Golden",
      billingCycle: BillingCycle.MONTHLY,
      price: 499,
      currency: "EGP",
      maxStudents: 500,
      maxCourses: 50,
      maxStorageGb: 50,
      maxLiveHours: 20,
      features: {
        create: [
          { featureKey: "QUIZZES",       enabled: true },
          { featureKey: "CERTIFICATES",  enabled: true },
          { featureKey: "LIVE_LECTURES", enabled: true },
          { featureKey: "CUSTOM_DOMAIN", enabled: true },
          { featureKey: "ANALYTICS",     enabled: true },
        ],
      },
    },
  });

  console.log("💳 Created 2 plans (Basic, Golden)");

  // ─── 3. SuperAdmin ────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("password123", 10);

  await prisma.user.create({
    data: {
      tenantId: null,
      name: "Super Admin",
      email: "superadmin@platform.com",
      hashedPassword,
      role: Role.SUPER_ADMIN,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=SuperAdmin",
    },
  });

  console.log("👑 Created SuperAdmin");

  // ─── 4. Tenant 1 — EduSaaS Academy (Golden) ──────────────────
  const tenant1Owner = await prisma.user.create({
    data: {
      tenantId: null,
      name: "Ahmed Hassan",
      email: "ahmed@edusaas-academy.com",
      hashedPassword,
      role: Role.ADMIN,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Ahmed",
    },
  });

  const tenant1 = await prisma.tenant.create({
    data: {
      name: "EduSaaS Academy",
      subdomain: "edusaas-academy",
      status: TenantStatus.ACTIVE,
      planId: goldenPlan.id,
      ownerUserId: tenant1Owner.id,
    },
  });

  await prisma.user.update({
    where: { id: tenant1Owner.id },
    data: { tenantId: tenant1.id },
  });

  // ─── 5. Tenant 2 — Design School (Basic) ─────────────────────
  const tenant2Owner = await prisma.user.create({
    data: {
      tenantId: null,
      name: "Sara Mohamed",
      email: "sara@design-school.com",
      hashedPassword,
      role: Role.ADMIN,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Sara",
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: "Design School",
      subdomain: "design-school",
      status: TenantStatus.TRIAL,
      planId: basicPlan.id,
      ownerUserId: tenant2Owner.id,
    },
  });

  await prisma.user.update({
    where: { id: tenant2Owner.id },
    data: { tenantId: tenant2.id },
  });

  console.log("🏫 Created 2 tenants (EduSaaS Academy, Design School)");

  // ─── 6. Subscriptions ─────────────────────────────────────────
  await prisma.subscription.create({
    data: {
      tenantId: tenant1.id,
      planId: goldenPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant2.id,
      planId: basicPlan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("💰 Created 2 subscriptions");

  // ─── 7. Users — Tenant 1 ──────────────────────────────────────
  const teacher1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      name: "Mohamed Khaled",
      email: "mohamed@edusaas-academy.com",
      hashedPassword,
      role: Role.TEACHER,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Mohamed",
    },
  });

  const student1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      name: "Omar Ali",
      email: "omar@edusaas-academy.com",
      hashedPassword,
      role: Role.STUDENT,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Omar",
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      name: "Nour Khaled",
      email: "nour@edusaas-academy.com",
      hashedPassword,
      role: Role.STUDENT,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Nour",
    },
  });

  // ─── 8. Users — Tenant 2 ──────────────────────────────────────
  const teacher2 = await prisma.user.create({
    data: {
      tenantId: tenant2.id,
      name: "Layla Ibrahim",
      email: "layla@design-school.com",
      hashedPassword,
      role: Role.TEACHER,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Layla",
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant2.id,
      name: "Youssef Ahmed",
      email: "youssef@design-school.com",
      hashedPassword,
      role: Role.STUDENT,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Youssef",
    },
  });

  console.log("👥 Created 5 users across 2 tenants");

  // ─── 9. Courses — Tenant 1 ────────────────────────────────────
  const course1 = await prisma.course.create({
    data: {
      tenantId: tenant1.id,
      title: "مقدمة في JavaScript",
      description: "تعلم أساسيات JavaScript من الصفر حتى الاحتراف.",
      category: "Programming",
      price: 0,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher1.id,
      thumbnail: "https://picsum.photos/seed/js/800/450",
    },
  });

  const course2 = await prisma.course.create({
    data: {
      tenantId: tenant1.id,
      title: "React من الصفر",
      description: "بناء تطبيقات ويب حديثة باستخدام React.",
      category: "Programming",
      price: 99.99,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher1.id,
      thumbnail: "https://picsum.photos/seed/react/800/450",
    },
  });

  // ─── 10. Courses — Tenant 2 ───────────────────────────────────
  const course3 = await prisma.course.create({
    data: {
      tenantId: tenant2.id,
      title: "تصميم UI/UX للمبتدئين",
      description: "أساسيات تصميم واجهات المستخدم وتجربة المستخدم.",
      category: "Design",
      price: 49.99,
      status: CourseStatus.PUBLISHED,
      instructorId: teacher2.id,
      thumbnail: "https://picsum.photos/seed/uiux/800/450",
    },
  });

  console.log("📚 Created 3 courses across 2 tenants");

  // ─── 11. Lessons (مع tenantId) ────────────────────────────────
  await prisma.lesson.createMany({
    data: [
      { title: "ما هو JavaScript؟",   videoUrl: "https://example.com/v/1",  duration: 600,  order: 1, courseId: course1.id, tenantId: tenant1.id },
      { title: "المتغيرات والأنواع",   videoUrl: "https://example.com/v/2",  duration: 900,  order: 2, courseId: course1.id, tenantId: tenant1.id },
      { title: "الشروط والحلقات",      videoUrl: "https://example.com/v/3",  duration: 1200, order: 3, courseId: course1.id, tenantId: tenant1.id },
      { title: "الدوال (Functions)",   videoUrl: "https://example.com/v/4",  duration: 1500, order: 4, courseId: course1.id, tenantId: tenant1.id },
      { title: "التعامل مع DOM",       videoUrl: "https://example.com/v/5",  duration: 1800, order: 5, courseId: course1.id, tenantId: tenant1.id },
      { title: "لماذا React؟",         videoUrl: "https://example.com/v/6",  duration: 600,  order: 1, courseId: course2.id, tenantId: tenant1.id },
      { title: "أول Component",        videoUrl: "https://example.com/v/7",  duration: 900,  order: 2, courseId: course2.id, tenantId: tenant1.id },
      { title: "Props وState",         videoUrl: "https://example.com/v/8",  duration: 1200, order: 3, courseId: course2.id, tenantId: tenant1.id },
      { title: "مبادئ التصميم",        videoUrl: "https://example.com/v/9",  duration: 900,  order: 1, courseId: course3.id, tenantId: tenant2.id },
      { title: "نظرية الألوان",         videoUrl: "https://example.com/v/10", duration: 1200, order: 2, courseId: course3.id, tenantId: tenant2.id },
      { title: "التايبوغرافي",          videoUrl: "https://example.com/v/11", duration: 900,  order: 3, courseId: course3.id, tenantId: tenant2.id },
    ],
  });

  console.log("🎬 Created 11 lessons");

  // ─── 12. Quizzes ──────────────────────────────────────────────
const quiz1 = await prisma.quiz.create({
  data: { title: "اختبار أساسيات JavaScript", timeLimit: 600, courseId: course1.id, tenantId: tenant1.id },
});

const quiz2 = await prisma.quiz.create({
  data: { title: "اختبار UI/UX Basics", timeLimit: 480, courseId: course3.id, tenantId: tenant2.id },
});
  console.log("📝 Created 2 quizzes");

  // ─── 13. Questions ────────────────────────────────────────────
  await prisma.question.createMany({
    data: [
      { text: "أي keyword للثوابت؟",                        options: ["var", "let", "const", "static"],                                                               correctIndex: 2, quizId: quiz1.id },
      { text: "ما الفرق بين == و === ؟",                    options: ["لا فرق", "=== يقارن القيمة فقط", "=== يقارن القيمة والنوع", "== يقارن النوع فقط"],            correctIndex: 2, quizId: quiz1.id },
      { text: "ما ناتج: console.log(1 + '2') ؟",            options: ["3", "'12'", "12", "Error"],                                                                    correctIndex: 1, quizId: quiz1.id },
      { text: "أي method لإضافة عنصر في نهاية Array؟",      options: ["push()", "pop()", "shift()", "unshift()"],                                                     correctIndex: 0, quizId: quiz1.id },
      { text: "ما ناتج: Boolean('') ؟",                     options: ["true", "false", "null", "undefined"],                                                          correctIndex: 1, quizId: quiz1.id },
      { text: "ما ناتج: [1,2,3].length ؟",                  options: ["2", "3", "4", "undefined"],                                                                    correctIndex: 1, quizId: quiz1.id },
      { text: "أي method لتحويل JSON string إلى Object؟",   options: ["JSON.stringify()", "JSON.parse()", "JSON.convert()", "JSON.toObject()"],                      correctIndex: 1, quizId: quiz1.id },
    ],
  });

  await prisma.question.createMany({
    data: [
      { text: "ما الفرق بين UI وUX؟",              options: ["لا فرق", "UI شكل الواجهة، UX تجربة المستخدم", "UX البرمجة، UI التصميم", "UI للموبايل فقط"],   correctIndex: 1, quizId: quiz2.id },
      { text: "ما مبدأ Contrast في التصميم؟",       options: ["نفس اللون في كل مكان", "إبراز العناصر المهمة بصرياً", "تقليل الألوان", "رفع حجم الخط"],        correctIndex: 1, quizId: quiz2.id },
      { text: "ما قاعدة 60-30-10؟",                options: ["60% رئيسي، 30% ثانوي، 10% تمييز", "توزيع الوقت", "نسبة المحتوى", "عدد الألوان"],            correctIndex: 0, quizId: quiz2.id },
      { text: "ما الـ Wireframe؟",                  options: ["النسخة النهائية", "مخطط هيكلي بسيط للصفحة", "كود HTML", "أنيميشن"],                           correctIndex: 1, quizId: quiz2.id },
      { text: "أفضل حجم للنص الأساسي على الويب؟", options: ["10-12px", "16-18px", "24-28px", "8-10px"],                                                       correctIndex: 1, quizId: quiz2.id },
      { text: "ما مبدأ Gestalt؟",                   options: ["استخدام الصور فقط", "إدراك الدماغ للعناصر كمجموعات", "طريقة ترميز الألوان", "نوع Typography"], correctIndex: 1, quizId: quiz2.id },
    ],
  });

  console.log("❓ Created 13 questions");

  // ─── 14. Enrollment ───────────────────────────────────────────
  await prisma.enrollment.create({
    data: {
      tenantId: tenant1.id,
      studentId: student1.id,
      courseId: course1.id,
      progress: 60,
    },
  });

  console.log("📋 Created 1 enrollment");

  // ─── Summary ──────────────────────────────────────────────────
  console.log("\n✅ Seed completed successfully!");
  console.log("─────────────────────────────────────────────────");
  console.log("💳 Plans        : 2  (Basic, Golden)");
  console.log("🏫 Tenants      : 2  (EduSaaS Academy, Design School)");
  console.log("👑 SuperAdmin   : 1");
  console.log("👥 Users        : 5  (2 admins, 2 teachers, 2 students) + SuperAdmin");
  console.log("📚 Courses      : 3  (2 في Tenant1, 1 في Tenant2)");
  console.log("🎬 Lessons      : 11");
  console.log("📝 Quizzes      : 2");
  console.log("❓ Questions    : 13");
  console.log("📋 Enrollments  : 1");
  console.log("─────────────────────────────────────────────────");
  console.log("\n🔑 Test credentials (password: password123)");
  console.log("   SuperAdmin : superadmin@platform.com");
  console.log("   ── Tenant 1: EduSaaS Academy ──────────────");
  console.log("   Admin      : ahmed@edusaas-academy.com");
  console.log("   Teacher    : mohamed@edusaas-academy.com");
  console.log("   Student    : omar@edusaas-academy.com");
  console.log("   Student    : nour@edusaas-academy.com");
  console.log("   ── Tenant 2: Design School ─────────────────");
  console.log("   Admin      : sara@design-school.com");
  console.log("   Teacher    : layla@design-school.com");
  console.log("   Student    : youssef@design-school.com");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });