import { h, icon, button, sheet } from './kit.js';

const ACTIONS = {
  jiaobei: ['toss', '轻甩手机，抛出筊杯'],
  qian: ['shake', '摇动手机，签筒跟着晃动'],
  liuyao: ['toss', '轻甩手机，掷出三枚铜钱'],
  fengshui: ['tilt', '转动手机，让罗盘跟着指向'],
  wheel: ['shake', '摇一摇手机，让转盘转起来'],
  tarot: ['shake', '摇动手机洗牌，轻甩手机抽牌'],
  runes: ['shake', '摇一摇手机，从袋中摸出符石'],
  crystal: ['tilt', '摇动或倾斜手机，与水晶球和灵摆互动'],
  omikuji: ['shake', '摇一摇手机，把御神签摇出来'],
  coin: ['shake', '轻甩抛硬币，摇动掷骰子'],
  plinko: ['shake', '摇一摇手机，让小球开始下落'],
};

/** One invitation per module visit, backed by the actual permission state. */
export function createMotionPrompt({ motion, meta, requestPermission, haptic }) {
  const [gesture, action] = ACTIONS[meta.id] || ['shake', '摇动手机，与器物互动'];
  const supported = motion.supported;
  let alive = true, offered = false, busy = false, dialog = null, detail = null, dialogButton = null;
  let error = false;
  const mark = h('span', { class: 'motion-entry-mark', attrs: { 'aria-hidden': 'true' } }, icon('g-' + gesture, { size: 30 }));
  const title = h('strong', { class: 'motion-entry-title' });
  const desc = h('span', { class: 'motion-entry-desc' });
  const enable = button('开启手机体感', { variant: 'primary', icon: 'motion', onClick: activate });
  const el = h('aside', { class: 'motion-entry', hidden: !supported, attrs: { 'aria-label': '手机体感' } }, mark, h('div', { class: 'motion-entry-copy', attrs: { 'aria-live': 'polite' } }, title, desc), enable);

  function instructions() {
    if (busy) return '请在浏览器提示中选择「允许」。';
    if (motion.state === 'denied') return '请在浏览器的网站设置中允许「运动与方向」，然后返回重试。';
    if (error) return '点击重新申请，并在浏览器提示中选择「允许」。';
    return '点击开启，在浏览器提示中选择「允许」。';
  }

  function sync() {
    if (!alive) return;
    const ready = motion.state === 'granted';
    el.hidden = !supported || motion.state === 'unsupported';
    el.classList.toggle('ready', ready);
    el.setAttribute('aria-busy', String(busy));
    title.textContent = ready ? '体感已开启' : '开启手机体感';
    desc.textContent = ready ? action : motion.state === 'denied' || error ? instructions() : action + '，先点下方开启。';
    enable.hidden = ready;
    enable.disabled = busy;
    enable.setLabel(busy ? '正在申请…' : motion.state === 'denied' || error ? '重新开启体感' : '开启手机体感');
    if (detail) detail.textContent = instructions();
    if (dialogButton) { dialogButton.disabled = busy; dialogButton.setLabel(busy ? '正在申请…' : motion.state === 'denied' || error ? '重新开启体感' : '开启手机体感'); }
    if (ready) dialog?.close();
  }

  async function activate() {
    if (!alive || busy) return;
    busy = true; error = false; sync();
    try {
      // Keep the native request in this click's activation, before any await.
      const result = await requestPermission();
      if (!alive) return;
      if (result === 'granted') { motion.resetInput?.(); haptic?.success(); }
    } catch { error = true; }
    finally { busy = false; sync(); }
  }

  function enter() {
    if (!alive || offered || !supported || motion.state === 'granted' || motion.state === 'unsupported' || !el.isConnected) return;
    // The first welcome screen owns focus until its Start action completes.
    if (document.querySelector('.onboard, .sheet.open')) return;
    offered = true;
    detail = h('p', { class: 'motion-invite-detail', attrs: { role: 'status' } }, instructions());
    const content = h('div', { class: 'motion-invite' },
      h('div', { class: 'motion-invite-phone', attrs: { 'aria-hidden': 'true' } }, icon('g-' + gesture, { size: 60 })),
      h('p', { class: 'motion-invite-action' }, action), detail,
    );
    dialogButton = button('开启手机体感', { variant: 'primary', size: 'large', onClick: activate });
    dialog = sheet({ title: '用手机动作来玩', content, actions: [dialogButton, button('使用屏幕操作', { variant: 'ghost', onClick: () => dialog.close() })] });
    dialog.el.classList.add('motion-invite-sheet');
    dialog.open(); sync();
  }

  sync();
  return { el, enter, sync, dispose() { alive = false; dialog?.close(); } };
}
