# WhatsApp Channel/newsletter text publishing

This fork adds one isolated endpoint to Evolution API 2.3.7:

```http
POST /newsletter/sendText/:instanceName
apikey: <global-or-instance-api-key>
Content-Type: application/json

{
  "jid": "120363429376422315@newsletter",
  "text": "Channel publication https://example.com/article",
  "linkPreview": true
}
```

The endpoint only accepts complete `@newsletter` JIDs. It reuses the connected
`WHATSAPP-BAILEYS` instance and its existing socket; it does not create another
WhatsApp session and does not change `/message/sendText/:instanceName`.

`linkPreview` is optional and defaults to `true`. When enabled, the endpoint
fetches the first URL in `text`, generates a JPEG thumbnail, uploads the
high-quality thumbnail through the connected socket using WhatsApp's dedicated
Newsletter CDN path, and sends the resulting metadata explicitly to Baileys.
If metadata, thumbnail generation, or upload fails, the publication continues
as plain text. Set `"linkPreview": false` to skip preview generation.

The `patch-package` postinstall step applies the Newsletter thumbnail upload fix
required by Baileys 7.0.0-rc.9 after every `npm install` or `npm ci`.

## Local checks

```bash
npm ci
npm test
npm run lint:check
npm run build
```

With PostgreSQL and Redis configured and a test instance connected:

```bash
curl -i --request POST \
  --url 'http://localhost:8080/newsletter/sendText/Canais%20CPG' \
  --header 'Content-Type: application/json' \
  --header 'apikey: REPLACE_WITH_A_TEST_KEY' \
  --data '{
    "jid": "120363429376422315@newsletter",
    "text": "Controlled staging publication https://example.com/article",
    "linkPreview": true
  }'
```

A successful response has HTTP status `201` and this shape:

```json
{
  "status": "success",
  "jid": "120363429376422315@newsletter",
  "messageId": "...",
  "linkPreviewGenerated": true
}
```

`linkPreviewGenerated` confirms that metadata and a thumbnail were generated
and uploaded before publishing. It is `false` when previews are disabled or the
preview pipeline falls back to plain text.

The connected account must be allowed to publish in the target Channel. Run the
real request only against a controlled staging instance and Channel. Also verify
private and group sends through the unchanged `/message/sendText/:instanceName`
endpoint before deploying the image.

## Container and rollback

Use the upstream multi-stage `Dockerfile`. Build a versioned image, for example:

```bash
docker build -t ghcr.io/ORGANIZATION/evolution-api:2.3.7-newsletter .
```

Before changing the EasyPanel image, record the currently deployed image, back
up PostgreSQL, and verify the Redis and persistent-volume configuration. This
change has no database migration, so rollback consists of restoring the recorded
image and redeploying with the same environment and volumes.
