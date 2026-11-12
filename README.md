# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener.
Node.js 20 or newer is required.

```sh
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
node cli.js help
```

Set `SNIP_API` to change the backend origin. It defaults to
`http://localhost:3000`. The `snip`, `snip.cmd`, and `snip.ps1` wrappers invoke
`cli.js` on POSIX shells, Windows Command Prompt, and PowerShell, respectively.

Run the test suite with `npm test`.
