const webpack = require('webpack');
const path = require('path');

module.exports = {
    mode: "development",
    watch: false,
    entry: {
        "demolished-live-code": "/build/src/editor/Editor.js",
        "demolished-live-spectate":"/build/src/spectator/SpectatorClient.js",
        "demolished-live-view": "/build/src/preview/View.js"

    },
    output: {
        path: __dirname + "/public/js/",
        filename: "[name]-bundle.js"
    },
    plugins: [
    ],
    module: {
        rules: [
            {
                test: /\.css$/, // Look for files ending with .css
                use: [
                    'style-loader', // 2. Inject CSS into the DOM
                    'css-loader',   // 1. Resolve imports and treat CSS as modules
                ],
            },
        ]
    },
    externals: {
    }

}