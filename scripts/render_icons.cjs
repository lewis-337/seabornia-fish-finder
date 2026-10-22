/* Regenerate raster icons from the vector master. No remote artwork or font dependency. */
const { chromium } = require(process.env.SEABORNIA_PLAYWRIGHT || "playwright");
const fs = require("node:fs/promises");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const p = await browser.newPage();
    await p.setContent("<html><body></body></html>");
    const source = await fs.readFile("icons/compass-v7.svg", "utf8");
    for (const [name, size, mask] of [
      ["32", 32],
      ["180", 180],
      ["192", 192],
      ["512", 512],
      ["maskable-512", 512, true],
    ]) {
      const data = await p.evaluate(
        async ({ source, size, mask }) => {
          const img = new Image();
          img.src =
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
          await img.decode();
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d");
          if (mask) {
            ctx.fillStyle = "#073e46";
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 38, 38, 436, 436);
          } else ctx.drawImage(img, 0, 0, size, size);
          return c.toDataURL("image/png").split(",")[1];
        },
        { source, size, mask },
      );
      await fs.writeFile(
        "icons/compass-v7-" + name + ".png",
        Buffer.from(data, "base64"),
      );
    }
  } finally {
    await browser.close();
  }
})();
