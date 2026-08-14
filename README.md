# نظام إدارة مكتب المحاماة
## Law Office Management System

تطبيق سطح مكتب لـ Windows لإدارة مكاتب المحاماة والاستشارات القانونية. الواجهة عربية (RTL) مع إنجليزية اختيارية.

### التشغيل للتطوير

```bash
npm install
npm run rebuild
npm run dev
```

الحساب الافتراضي:

- المستخدم: `admin`
- كلمة المرور: `Admin@123`

بعد الدخول: الإعدادات ← **تحميل بيانات تجريبية** لإنشاء 10 عملاء و10 قضايا و5 محامين وجلسات ومهام ومدفوعات.

### البناء للتوزيع

```bash
npm run dist
```

يُنشئ مثبّت NSIS داخل مجلد `release` مع اختصار على سطح المكتب. مكتبة `better-sqlite3` تُفك من الـ asar حتى لا تفشل بعد التثبيت.

لرفع نسخة إلى GitHub Releases (يتطلب `GH_TOKEN` بصلاحية `repo`):

```bash
npm run dist:publish
```

### رفع تحديث للعملاء (Auto-Update)

التطبيق المثبت يفحص GitHub Releases عند التشغيل عبر `electron-updater`.

1. ارفع رقم الإصدار في `package.json` (مثال: `1.0.1`) — لازم يكون أعلى من نسخة العميل.
2. اعمل commit ثم tag مطابق للإصدار:

```bash
git add package.json package-lock.json
git commit -m "Release 1.0.1"
git tag v1.0.1
git push origin HEAD
git push origin v1.0.1
```

3. ابنِ وانشر:

```bash
set GH_TOKEN=github_pat_xxx
npm run dist:publish
```

أو أنشئ Release يدوياً من GitHub وارفع ملفات مجلد `release`:

- `Law Office Management System-Setup-1.0.1.exe`
- `latest.yml` (ضروري للتحديث التلقائي)

بدون `latest.yml` العميل لن يرى التحديث.

4. تأكد أن الـ Release **منشور (published)** وليس draft، والمستودع عام (أو العميل لديه توكن للوصول لمستودع خاص).
5. عند فتح النسخة المثبتة: تظهر نسبة التحميل، وبعدها زر إعادة التشغيل للتثبيت.

### بيانات التطبيق

`%APPDATA%/law-office-management/LawOfficeManagement/`

- `lawoffice.db` قاعدة SQLite (وضع WAL)
- `documents/` المستندات
- `backups/` النسخ الاحتياطية المشفّرة

### الوحدات

العملاء، القضايا، الجلسات، التقويم، المهام، التذكيرات، المستندات، التوكيلات، العقود، الخصوم، المحامون، الموظفون، الاستشارات، المراسلات، الحسابات، الخزينة، الفواتير، التقارير، الأرشيف، المستخدمون والصلاحيات، النسخ الاحتياطي، سجل العمليات.
