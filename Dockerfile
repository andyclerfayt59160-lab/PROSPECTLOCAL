FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend /app/frontend

ENV EXPO_PUBLIC_API_URL=
ENV EXPO_PUBLIC_BACKEND_URL=
ENV REACT_APP_BACKEND_URL=

RUN npx expo export --platform web --output-dir dist_railway --max-workers 1
RUN printf "%s\n" \
  "window.__PROSPECTLOCAL_RUNTIME__ = Object.assign(" \
  "  {}," \
  "  window.__PROSPECTLOCAL_RUNTIME__ || {}," \
  "  {" \
  "    apiUrl: \"__SAME_ORIGIN__\"," \
  "  }" \
  ");" > /app/frontend/dist_railway/runtime-config.js

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FRONTEND_DIST_DIR=/app/frontend/dist_railway

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY --from=frontend-build /app/frontend/dist_railway /app/frontend/dist_railway

WORKDIR /app/backend

EXPOSE 8080

CMD sh -c "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"
