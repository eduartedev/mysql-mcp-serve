const config = {
  mcpServers: {
    "mysql-mcp-server": {
      command: "npx",
      args: ["-y", "@eduartedev/mysql-mcp-server"],
      env: {
        DB_HOST: "localhost",
        DB_ACCESS_MODE: "readonly",
      },
    },
  },
};
const b64 = Buffer.from(JSON.stringify(config)).toString("base64");
console.log(b64);