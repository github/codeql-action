export default {
  typescript: {
    rewritePaths: {
      "src/": "build/",
    },
    compile: false,
  },
  require: ["./ava.setup.mjs"],
};
