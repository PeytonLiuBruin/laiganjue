// 设置页底部的版本行：「版本 1.0.0 · 第 92 版 · 10月22日 16:40 · cd09825」
// 构建号是 git 提交数，只增不减，装到手机上一眼就能看出是不是新版。时间按本机时区显示。
export function versionText(info, tz) {
  if (!info) return '版本 开发模式';
  const d = new Date(info.time);
  const opts = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, ...(tz ? { timeZone: tz } : {}) };
  let when = '';
  if (!Number.isNaN(d.getTime())) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', opts).formatToParts(d).map((x) => [x.type, x.value]));
    when = `${p.month}月${p.day}日 ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }
  return ['版本 ' + info.version, info.build ? `第 ${info.build} 版` : '', when, info.commit].filter(Boolean).join(' · ');
}
