// Miro Web SDK entry point.
// Declared as `sdkUri` in the Miro app manifest.
// Miro loads this script on every board where the app is installed.

const APP_ORIGIN = window.location.origin;

type MiroSdk = typeof import('@mirohq/websdk-types') extends { default: infer T } ? T : never;
declare const miro: { board: any };

async function init() {
  await miro.board.ui.on('icon:click', async () => {
    // Open the panel without a specific activity — show a picker
    await miro.board.ui.openPanel({
      url: `${APP_ORIGIN}/miro`,
      width: 380,
    });
  });

  // When a Womble app card is clicked, open the panel for that activity
  await miro.board.ui.on('app_card:open', async (event: { appCard: any }) => {
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
