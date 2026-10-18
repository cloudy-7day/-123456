FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7860

# No npm dependencies. Copy only runtime files; never bake credentials into images.
COPY --chown=node:node package.json server.mjs cli.mjs ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node contracts/ ./contracts/
COPY --chown=node:node prompts/ ./prompts/
COPY --chown=node:node examples/ ./examples/
COPY --chown=node:node vendor/ ./vendor/
RUN mkdir -p /app/output/media /app/tmp && chown -R node:node /app/output /app/tmp

USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/contracts').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
