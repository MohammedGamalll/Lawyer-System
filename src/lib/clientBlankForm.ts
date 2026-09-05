export function clientBlankFormHtml(): string {
  const box = (label: string, h = 28) =>
    `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;margin-bottom:4px">${label}</div><div style="border:1px solid #cfd8e3;height:${h}px;border-radius:4px"></div></div>`
  const row = (cells: string) => `<div style="display:flex;gap:10px;align-items:flex-end">${cells}</div>`
  const cell = (label: string, flex: number, h = 28) =>
    `<div style="flex:${flex}">${box(label, h)}</div>`
  return `
    <p style="margin:0 0 12px;font-size:13px">يرجى ملء البيانات بخط واضح وتسليم الورقة للسكرتارية.</p>
    ${row(`${cell('الاسم الكامل', 3)}${cell('اسم الشهرة', 2)}${cell('الرقم القومي / جواز السفر', 2)}${cell('ملاحظات سريعة', 2)}`)}
    ${row(`${cell('واتس', 1)}${cell('هاتف آخر', 1)}${cell('هاتف المنزل', 1)}${cell('هاتف العمل', 1)}`)}
    ${row(`${cell('العنوان', 4)}${cell('البريد الإلكتروني', 2)}`)}
    ${box('عنوان إضافي (إن وجد)')}
    ${row(`${cell('الوظيفة', 2)}${cell('السجل التجاري', 2)}${cell('البطاقة الضريبية', 2)}`)}
    ${box('ملاحظات', 64)}
  `
}
