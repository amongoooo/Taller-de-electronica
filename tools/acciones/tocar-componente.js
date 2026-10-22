// Ejemplo para --accion: toca el primer componente con tarjeta del panel que se ve (abre su tarjeta)
// y, si la página usa el banco, también puede abrir la del multímetro con ACCION=multimetro.
module.exports = async (page) => {
  const pnl = (await page.locator('#pe').boundingBox()) ? '#pe' : '#pw';
  const tap = async (sel, dy) => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) return;
    await page.mouse.click(b.x + b.width / 2, dy == null ? b.y + b.height / 2 : b.y + dy);
    await page.waitForTimeout(400);
  };
  if (process.env.ACCION === 'multimetro') {
    await page.evaluate(() => Sim.benchNow && Sim.benchNow.showMeters({ a: true }));
    await page.waitForTimeout(300);
    await tap(`${pnl} .sim-meter-hit`, 12);   // arriba de la caja: la rueda y las teclas van encima
  } else await tap(`${pnl} .sim-pinch, ${pnl} .sim-hit`);
  await page.waitForTimeout(400);
};
