# Lyceum Placements — Placement Management System
# Copyright (c) 2026 Bhanu Mendis. All rights reserved.
#
# Builds a static lpl-api binary into a distroless image. Run from lpl-pms/server:
#   docker build -t lpl-api .

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/lpl-api ./cmd/lpl-api \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/lpl-dbtool ./cmd/lpl-dbtool

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/lpl-api /lpl-api
COPY --from=build /out/lpl-dbtool /lpl-dbtool
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/lpl-api"]
