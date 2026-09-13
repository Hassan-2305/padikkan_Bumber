/* Standalone block screen. Chrome's PDF viewer refuses content scripts, so
   those navigations get bounced to this page instead. */
(function () {
  const target = new URLSearchParams(location.search).get('u') || '';
  const mount = document.getElementById('mount');
  let ui = null;

  function go() {
    if (!target) { history.back(); return; }
    location.replace(target);
  }

  PBOverlay.send('state').then((state) => {
    state = state || PB.publicState({});
    if (state.accessUntil > Date.now()) { go(); return; }
    PBOverlay.send('blocked');
    ui = PBOverlay.create({
      container: mount,
      state,
      siteLabel: PB.siteLabel(target),
      onRelease: go
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.pb_state || !ui) return;
    ui.update(PB.publicState(changes.pb_state.newValue || {}));
  });
})();
