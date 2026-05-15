const APP_ORIGIN = window.location.origin;

async function init() {
  await miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({
      url: `${APP_ORIGIN}/miro`,
      width: 380,
    });
  });

  await miro.board.ui.on('app_card:open', async (event) => {
    const { appCard } = event;
    const configId = appCard.linkedTo?.replace(`${APP_ORIGIN}/miro?configId=`, '');
    if (configId) {
      await miro.board.ui.openPanel({
        url: `${APP_ORIGIN}/miro?configId=${configId}`,
        width: 380,
      });
    }
  });
}

init();
