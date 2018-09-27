//
//  TileGlPlugin
//

(function () {
    'use strict';

    var pluginName = 'TileGlPlugin',
        serverBase = window.serverBase || '//maps.kosmosnimki.ru/';

    window.nsGmx = window.nsGmx || {};

    var TileRender = function (params) {

        params = params || {};

        this._handler = null;
        this._sourceTexture = null;
        this._paletteTexture = null;
        this._frameVertBuffer = null;
        this._width = params.width || 256;
        this._height = params.height || 256;

        this._queue = [];
    };

    TileRender.prototype = {
        setPalette: function (pal) {
            var palCanvas = document.createElement('canvas');
            palCanvas.width = 256;
            palCanvas.height = 1;
            var palData = new Uint8Array(256 * 4);

            for (var i = 0; i < 256; i++) {

                var r = 0, g = 0, b = 0;

                if (pal[i] != undefined) {
                    r = pal[i].partRed;
                    g = pal[i].partGreen;
                    b = pal[i].partBlue;
                }

                var i4 = i * 4;
                palData[i4] = r;
                palData[i4 + 1] = g;
                palData[i4 + 2] = b;
                palData[i4 + 3] = 255;

            }

            var context = palCanvas.getContext('2d');
            var imageData = context.createImageData(palCanvas.width, palCanvas.height);
            imageData.data.set(palData);
            context.putImageData(imageData, 0, 0);

            this._paletteTexture = this._handler.createTexture_n(palCanvas);
        },

        initialize: function () {

            this._handler = new og.Handler(null, {
                width: this._width,
                height: this._height,
                context: {
                    alpha: true,
                    depth: false
                }
            });
            this._handler.initialize();
            this._handler.deactivateFaceCulling();
            this._handler.deactivateDepthTest();

            this._framebuffer = new og.Framebuffer(this._handler, {
                width: this._width,
                height: this._height,
                useDepth: false
            });

            this._framebuffer.init();

            this._frameVertBuffer = this._handler.createArrayBuffer(new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), 2, 4);

            this._handler.addProgram(new og.Program("ndvi", {
                uniforms: {
                    srcTexture: { type: 'sampler2d' },
                    palTexture: { type: 'sampler2d' }
                },
                attributes: {
                    frameVert: { type: 'vec2' }
                },
                vertexShader: "attribute vec2 frameVert;\n\
							varying vec2 uv;\n\
							void main(){\n\
								uv = (frameVert * vec2(1.0,1.0) + 1.0) * 0.5;\n\
								gl_Position.xy = frameVert;\n\
								gl_Position.zw = vec2(0.0, 1.0);\n\
							}",
                fragmentShader:
                "precision highp float;\n\
							uniform sampler2D srcTexture;\n\
							uniform sampler2D palTexture;\n\
							varying vec2 uv;\n\
							void main(){\n\
								vec4 srcPix = texture2D(srcTexture, uv);\n\
								vec4 ndviColor = texture2D(palTexture, vec2(srcPix.r, 0.0));\n\
								gl_FragColor = vec4(ndviColor.rgb, 1.0);\n\
							}"
            }));
        },

        render: function (outData, srcImage) {

            var h = this._handler,
                gl = h.gl;

            gl.deleteTexture(this._sourceTexture);

            this._sourceTexture = h.createTexture_n(srcImage);

            h.Programs.ndvi.activate();
            var sh = h.Programs.ndvi._program;
            var sha = sh.attributes,
                shu = sh.uniforms;

            this._framebuffer.activate();

            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._sourceTexture);
            gl.uniform1i(shu.srcTexture, 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this._paletteTexture);
            gl.uniform1i(shu.palTexture, 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._frameVertBuffer);
            gl.vertexAttribPointer(sha.frameVert, this._frameVertBuffer.itemSize, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            this._framebuffer.deactivate();

            return this._framebuffer.readAllPixels(outData);
        }
    };

    var publicInterface = {
        pluginName: pluginName,
        afterViewer: function (params) {
            this.load(params.ndviIDS);
        },
        load: function (ndviIDS) {

            ndviIDS = ndviIDS || '8288D69C7C0040EFBB7B7EE6671052E3';

            var arr = ndviIDS.split(','),
                path = publicInterface.path,
                prefix = path + publicInterface.pluginName;

            Promise.all([
                path + 'og.webgl.js',
                serverBase + 'api/plugins/agro_plugins_api_v2/themesModule/shared.js'
            ].map(L.gmxUtil.requestLink)).then(function () {

                window.shared.loadPaletteSync(serverBase + 'api/plugins/palettes/EXPERIMENTAL_NDVI_interp_legend.icxleg.xml', function (pal) {

                    var tileRender = new TileRender();
                    tileRender.initialize();
                    tileRender.setPalette(pal);

                    ndviIDS.split(',').map(function (id) {

                        var gmxLayer = nsGmx.gmxMap.layersByID[id.trim()];

                        var _data = new Uint8Array(256 * 256 * 4);

                        if (gmxLayer) {
                            gmxLayer.setRasterHook(function (dstCanvas, srcImage, sx, sy, sw, sh, dx, dy, dw, dh, info) {
                                if (srcImage) {

                                    tileRender.render(_data, srcImage);

                                    var context = dstCanvas.getContext('2d');
                                    var imageData = context.createImageData(dstCanvas.width, dstCanvas.height);
                                    imageData.data.set(_data);
                                    context.putImageData(imageData, 0, 0);
                                    context.drawImage(dstCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

                                    return dstCanvas;
                                }
                            });
                        }

                    });
                });
            });
        }
    };

    if (window.gmxCore) {
        publicInterface.path = gmxCore.getModulePath(pluginName);
        window.gmxCore.addModule(pluginName, publicInterface, {});
    } else {
        window.nsGmx[pluginName] = publicInterface;
    }
})();
