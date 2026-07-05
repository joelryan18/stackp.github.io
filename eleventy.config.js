export default function (eleventyConfig) {
  // hashed bundles (Task 4 populates dist-assets/)
  eleventyConfig.addPassthroughCopy({ "dist-assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });

  // TEMPORARY (removed in Task 6): plain assets at their legacy URLs
  eleventyConfig.addPassthroughCopy({ "src/assets/css/styles.css": "styles.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/main.js": "main.js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/consent.js": "consent.js" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js/neural3d.js": "neural3d.js" });

  // static files
  for (const f of ["src/og.png", "src/robots.txt", "src/ads.txt", "src/CNAME", "src/sitemap.xml", "src/404.html", "src/blog"]) {
    eleventyConfig.addPassthroughCopy(f);
  }
  // out-of-scope files are copied verbatim, never templated
  eleventyConfig.ignores.add("src/404.html");
  eleventyConfig.ignores.add("src/blog/**");

  eleventyConfig.addWatchTarget("dist-assets");

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
