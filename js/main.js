/* ============================================================
 * main.js  -  エントリポイント & メニューUI制御
 * ============================================================ */
(function(){
  const $ = (id) => document.getElementById(id);

  function setupMenu(){
    const menu = $('menu');
    const teamPick = $('teamPick');
    let chosenMode = 'bot';

    // モード選択（Bot / 友達）
    document.querySelectorAll('.menuButtons .btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        chosenMode = btn.dataset.mode;
        // 友達対戦は次ステップで実装。今はチーム選択へ進める
        $('teamPick').classList.remove('hidden');
        document.querySelector('.menuButtons').classList.add('hidden');
      });
    });

    // 戻る
    $('backFromTeam').addEventListener('click', () => {
      teamPick.classList.add('hidden');
      document.querySelector('.menuButtons').classList.remove('hidden');
    });

    // チーム選択 → マッチ開始
    document.querySelectorAll('.teamBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const team = btn.dataset.team;
        Game.startMatch(chosenMode, team);
      });
    });

    // 遊び方
    $('howtoBtn').addEventListener('click', () => $('howto').classList.remove('hidden'));
    $('closeHowto').addEventListener('click', () => $('howto').classList.add('hidden'));

    // リザルト → メニュー
    $('resultBack').addEventListener('click', () => {
      $('result').classList.add('hidden');
      // メニューリセット
      teamPick.classList.add('hidden');
      document.querySelector('.menuButtons').classList.remove('hidden');
      Game.backToMenu();
    });
  }

  window.addEventListener('load', () => {
    Game.init();
    setupMenu();
    // デバッグ用: ?auto=cop|robber で即マッチ開始
    const params = new URLSearchParams(location.search);
    const auto = params.get('auto');
    if(auto === 'cop' || auto === 'robber'){
      Game.startMatch('bot', auto);
    }
  });
})();
