async (page) => {
 await page.route('**/packages/render/src/index.ts*', async route => {
  const response = await route.fetch();
  let body = await response.text();
  if (!body.includes('const diagnostics = createRenderDiagnostics(scene)')) throw Error('Diagnostics hook changed');
  body = body.replace('const diagnostics = createRenderDiagnostics(scene)', 'const diagnostics = window.__renderDiagnostics = createRenderDiagnostics(window.__renderScene = scene)');
  await route.fulfill({response, body});
 });
 await page.reload();
}
