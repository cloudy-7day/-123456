FROM node:24-bookworm-slim AS toolchain
WORKDIR /app
RUN npm install --global pnpm@11.25.0

FROM toolchain AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM toolchain AS frontend-build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY modules/scenario/ ./modules/scenario/
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 KNOWLEDGE_SOURCE=local
COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
COPY --chown=node:node package.json server.mjs cli.mjs ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node contracts/ ./contracts/
COPY --chown=node:node knowledge/ ./knowledge/
COPY --chown=node:node prompts/ ./prompts/
COPY --chown=node:node examples/task.json ./examples/task.json
COPY --chown=node:node public/index.html ./public/index.html
COPY --chown=node:node --from=frontend-build /app/public/scenario/ ./public/scenario/
COPY --chown=node:node modules/scenario/server/ ./modules/scenario/server/
COPY --chown=node:node modules/scenario/shared/ ./modules/scenario/shared/
COPY --chown=node:node vendor/ima-skills-1.1.10/ima-skill/ima_api.cjs vendor/ima-skills-1.1.10/ima-skill/meta.json ./vendor/ima-skills-1.1.10/ima-skill/
RUN mkdir -p /app/output/media /app/tmp && chown -R node:node /app/output /app/tmp
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/contracts').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
