(function (root) {
  'use strict';
  const levels = ['大', '中', '小'], bank = [];
  const income = { 大: '1億円', 中: '2000万円', 小: '600万円' };
  const amount = { 大: '3000万円', 中: '300万円', 小: '30万円' };
  const duration = { 大: '3年間', 中: '半年間', 小: '1か月間' };
  const use = { 大: '性的サービスを提供する店', 中: '女性従業員が接客するクラブ', 小: '一般の飲食店' };
  let n = 1;
  for (const justice of levels) for (const envy of levels) for (const sexual of levels) {
    for (const category of ['金銭', '不倫']) for (let v = 0; v < 2; v++) {
      const id = 'DEMO-' + String(n++).padStart(3, '0');
      let text;
      if (category === '金銭') {
        text = v === 0
          ? `会社経営者A氏（40）が、会社の資金${amount[justice]}を私的に使っていたことが社内調査で分かった。使途は${use[sexual]}での支払いで、過去1年間にわたる。年収は${income[envy]}。A氏は流用を認めた。`
          : `週刊誌が、食品会社の社長B氏（42）による資金流用を報じた。ここ1年間に${use[sexual]}で使った計${amount[justice]}を、会社の経費で払っていたという。年収${income[envy]}のB氏も私的利用だったと認めた。`;
      } else {
        const quote = sexual === '大'
          ? (v === 0 ? '「服を脱いで抱き合った夜を思い出す」との文面も掲載された。' : '「あの晩、ベッドで肌を寄せ合ったね」とのメッセージも載った。')
          : sexual === '中'
            ? (v === 0 ? '「次の休みは二人だけで泊まりたい」との文面も掲載された。' : '「今度は朝まで一緒にいられる？」とのメッセージも載った。')
            : (v === 0 ? '二人は知人の紹介で出会ったという。' : '二人は仕事を通じて知り合ったという。');
        text = v === 0
          ? `既婚の俳優C（40）が、知人と${duration[justice]}不倫していたと週刊誌が報じた。年収は${income[envy]}。${quote}Cは取材に対し、関係を認めた。`
          : `年収${income[envy]}の歌手D（42）が、週刊誌の報じた不倫を認めた。Dは既婚で、知人との関係は${duration[justice]}続いたという。${quote}`;
      }
      bank.push({ id, category, justice, envy, sexual, text });
    }
  }
  if (typeof module !== 'undefined') module.exports = bank;
  root.DEMO_BANK = bank;
})(typeof globalThis !== 'undefined' ? globalThis : this);
