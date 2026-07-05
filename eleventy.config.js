export default function (eleventyConfig) {
  // hashed bundles (Task 4 populates dist-assets/)
  eleventyConfig.addPassthroughCopy({ "dist-assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });

  // static files
  for (const f of ["src/og.png", "src/robots.txt", "src/ads.txt", "src/CNAME", "src/sitemap.xml", "src/404.html", "src/blog"]) {
    eleventyConfig.addPassthroughCopy(f);
  }
  // out-of-scope files are copied verbatim, never templated
  eleventyConfig.ignores.add("src/404.html");
  eleventyConfig.ignores.add("src/blog/**");
  // assets are bundled/passthrough-copied, never templated (LICENSES.md would
  // otherwise be rendered into a stray HTML page)
  eleventyConfig.ignores.add("src/assets/**");

  eleventyConfig.addWatchTarget("dist-assets");

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
