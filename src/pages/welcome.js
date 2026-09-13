/* Welcome page: fills in the real odds from config so the joke stays honest. */
(function () {
  document.querySelector('[data-halo]').innerHTML = PBOverlay.ornament();
  document.querySelector('[data-brand]').insertAdjacentHTML('afterbegin', PBOverlay.LAMP);

  const odds = document.querySelector('[data-odds]');
  for (const p of PB.PRIZES) {
    if (p.id === 'blank') continue;
    const chip = document.createElement('span');
    chip.className = 'odd';
    const pct = (p.p * 100).toFixed(p.p < 0.01 ? 1 : 0) + '%';
    chip.innerHTML = `<b></b> · ${pct}`;
    chip.querySelector('b').textContent = p.ml;
    odds.append(chip);
  }
  const blank = PB.PRIZES.find((p) => p.id === 'blank');
  const last = document.createElement('span');
  last.className = 'odd';
  last.innerHTML = `<b></b> · ${(blank.p * 100).toFixed(0)}%`;
  last.querySelector('b').textContent = blank.ml;
  last.style.borderColor = 'rgba(226,64,47,.4)';
  odds.append(last);

  document.querySelector('[data-start]').addEventListener('click', () => {
    PBFX.sound.coin();
    PBOverlay.send('openMine', { id: 'instagram' });
  });
  document.querySelector('[data-close]').addEventListener('click', () => window.close());
})();
