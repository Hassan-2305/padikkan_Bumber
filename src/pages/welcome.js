/* Welcome page: fills in the real odds from config so the joke stays honest. */
(function () {
  document.querySelector('[data-halo]').innerHTML = PBOverlay.ornament();
  document.querySelector('[data-brand]').insertAdjacentHTML('afterbegin', PBOverlay.LAMP);

  const odds = document.querySelector('[data-odds]');
  for (const lot of PB.LOTS) {
    const chip = document.createElement('span');
    chip.className = 'odd';
    chip.innerHTML = `<b></b> · ${lot.price} കോയിൻ · ${lot.seconds}s · ${(lot.win * 100).toFixed(0)}%`;
    chip.querySelector('b').textContent = lot.ml;
    if (lot.id === 'bumper') chip.style.borderColor = 'rgba(226,64,47,.4)';
    odds.append(chip);
  }

  document.querySelector('[data-start]').addEventListener('click', () => {
    PBFX.sound.coin();
    PBOverlay.send('openMine', { id: 'instagram' });
  });
  document.querySelector('[data-close]').addEventListener('click', () => window.close());
})();
