self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/ingest/static/:path*"
      },
      {
        "source": "/ingest/:path*"
      },
      {
        "source": "/api/:path*",
        "destination": "/api/:path*"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()