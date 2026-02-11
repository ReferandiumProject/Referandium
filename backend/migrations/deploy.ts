// Migrations are an early feature. Currently, they're nothing more than this
// temporary script that wraps deploy and is invoked from the CLI, injecting a
// provider configured from the workspace's Anchor.toml.

const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider) {
  anchor.setProvider(provider);
};
