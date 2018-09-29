//
//  TileGlPlugin
//

(function () {
    'use strict';

    var pluginName = 'AISTileGlPlugin',
        serverBase = window.serverBase || '//maps.kosmosnimki.ru/';

    window.nsGmx = window.nsGmx || {};

    var AISTileRender = function (params) {

        params = params || {};

        this._handler = null;
        this._framebuffer = null;
        this._width = params.width || 256;
        this._height = params.height || 256;

        this._textureAtlas = null;

        this._vesselTypeTexCoords = {};
    };

    AISTileRender.prototype = {

        createTextureAtlas: function (styles) {

            var W = 16,
                H = 16;

            this._textureAtlas = new og.TextureAtlas(512, 512);
            this._textureAtlas.assignHandler(this._handler);

            var _this = this;

            for (var i = 0; i < styles.length; i++) {

                var si = styles[i];

                var f = si.Filter,
                    t;
                if (!f) {
                    t = "unknown";
                } else {
                    t = f.split('=')[1].trim();
                    t = t.substr(1, t.length - 2);
                }

                var src = si.RenderStyle.iconUrl;

                (function (src, t) {

                    var canvas = document.createElement('canvas');
                    canvas.width = W;
                    canvas.height = H;

                    var img = new Image();
                    img.crossOrigin = '';

                    img.onload = function () {

                        canvas.getContext("2d").drawImage(img, 0, 0, W, H);

                        _this._textureAtlas.loadImage(canvas.toDataURL(), function (img, texCoords) {
                            _this._vesselTypeTexCoords[t] = texCoords;
                        });
                    };

                    img.src = src;

                })(src, t);

            }
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

            this._handler.addProgram(new og.Program("billboard", {
                uniforms: {
                    u_texture: { type: 'sampler2d' },
                    extentParams: { type: 'vec4' }
                },
                attributes: {
                    a_vert_tex: { type: 'vec4' },
                    a_lonlat_rotation: { type: 'vec3' },
                    a_size_offset: { type: 'vec4' }
                },
                vertexShader:
                'attribute vec4 a_size_offset;\n\
                attribute vec4 a_vert_tex;\n\
                attribute vec3 a_lonlat_rotation;\n\
                \n\
                uniform vec4 extentParams; \n\
                \n\
                varying vec2 uv;\n\
                \n\
                const float INV_SIZE = 2.0 / 256.0;\n\
                const float RAD = 3.141592653589793 / 180.0;\n\
                \n\
                void main(){\n\
                    uv = a_vert_tex.zw;\n\
                    vec2 c = (-1.0 + (a_lonlat_rotation.xy - extentParams.xy) * extentParams.zw) * vec2(1.0, -1.0);\n\
                    vec2 p = c + a_vert_tex.xy * a_size_offset.xy * INV_SIZE; \n\
                    \n\
                    vec2 shifted = p - c;\n\
                    float rot = a_lonlat_rotation.z * RAD;\n\
                    float cos_rot = cos(rot);\n\
                    float sin_rot = sin(rot);\n\
                    \n\
                    gl_Position = vec4(c + vec2(shifted.x * cos_rot - shifted.y * sin_rot, shifted.x * sin_rot + shifted.y * cos_rot), 0.0, 1.0); \n\
				}',
                fragmentShader:
                'precision highp float;\n\
                \n\
                uniform sampler2D u_texture;\n\
                \n\
                varying vec2 uv;\n\
                \n\
                void main () {\n\
                    vec4 color = texture2D(u_texture, uv);\n\
                    if(color.a < 0.1)\n\
                        discard;\n\
                    gl_FragColor = color;/*vec4(color, 1.0);*/\n\
                }'
            }));
        },

        _createBuffers: function (tileData) {

            var h = this._handler,
                gl = h.gl;

            gl.deleteBuffer(this._a_vert_tex_buffer);
            gl.deleteBuffer(this._a_lonlat_rotation_buffer);
            gl.deleteBuffer(this._a_size_offset_buffer);

            var geoItems = tileData.geoItems,
                length = geoItems.length;

            this._a_vert_tex_bufferArr = new Float32Array(length * 24);
            this._a_size_offset_bufferArr = new Float32Array(length * 24);
            this._a_lonlat_rotation_bufferArr = new Float32Array(length * 18);

            var v = this._a_vert_tex_bufferArr,
                c = this._a_lonlat_rotation_bufferArr,
                s = this._a_size_offset_bufferArr;

            var _w = 10.0, _h = 20.0,
                dx = 0.0, dy = 0.0;

            var VT = 5,
                LL = 34,
                ROT = 19;

            var vtc = this._vesselTypeTexCoords;


            for (var i = 0; i < length; i++) {

                var prop = geoItems[i].properties,
                    lon = prop[LL].coordinates[0],
                    lat = prop[LL].coordinates[1],
                    rot = prop[ROT];

                var tc = vtc[prop[VT]] || vtc.unknown;

                var i24 = i * 24,
                    i18 = i * 18;

                v[i24 + 0] = -0.5;
                v[i24 + 1] = -0.5;
                v[i24 + 2] = tc[0];
                v[i24 + 3] = tc[1];
                v[i24 + 4] = -0.5;
                v[i24 + 5] = 0.5;
                v[i24 + 6] = tc[2];
                v[i24 + 7] = tc[3];
                v[i24 + 8] = 0.5;
                v[i24 + 9] = 0.5;
                v[i24 + 10] = tc[4];
                v[i24 + 11] = tc[5];
                v[i24 + 12] = 0.5;
                v[i24 + 13] = 0.5;
                v[i24 + 14] = tc[6];
                v[i24 + 15] = tc[7];
                v[i24 + 16] = 0.5;
                v[i24 + 17] = -0.5;
                v[i24 + 18] = tc[8];
                v[i24 + 19] = tc[9];
                v[i24 + 20] = -0.5;
                v[i24 + 21] = -0.5;
                v[i24 + 22] = tc[10];
                v[i24 + 23] = tc[11];

                s[i24 + 0] = _w;
                s[i24 + 1] = _h;
                s[i24 + 2] = dx;
                s[i24 + 3] = dy;
                s[i24 + 4] = _w;
                s[i24 + 5] = _h;
                s[i24 + 6] = dx;
                s[i24 + 7] = dy;
                s[i24 + 8] = _w;
                s[i24 + 9] = _h;
                s[i24 + 10] = dx;
                s[i24 + 11] = dy;
                s[i24 + 12] = _w
                s[i24 + 13] = _h;
                s[i24 + 14] = dx;
                s[i24 + 15] = dy;
                s[i24 + 16] = _w;
                s[i24 + 17] = _h;
                s[i24 + 18] = dx;
                s[i24 + 19] = dy;
                s[i24 + 20] = _w;
                s[i24 + 21] = _h;
                s[i24 + 22] = dx;
                s[i24 + 23] = dy;

                c[i18 + 0] = lon;
                c[i18 + 1] = lat;
                c[i18 + 2] = rot;
                c[i18 + 3] = lon;
                c[i18 + 4] = lat;
                c[i18 + 5] = rot;
                c[i18 + 6] = lon;
                c[i18 + 7] = lat;
                c[i18 + 8] = rot;
                c[i18 + 9] = lon;
                c[i18 + 10] = lat;
                c[i18 + 11] = rot;
                c[i18 + 12] = lon;
                c[i18 + 13] = lat;
                c[i18 + 14] = rot;
                c[i18 + 15] = lon;
                c[i18 + 16] = lat;
                c[i18 + 17] = rot;
            }

            this._a_vert_tex_buffer = h.createArrayBuffer(v, 4, v.length / 4, gl.DYNAMIC_DRAW);
            this._a_size_offset_buffer = h.createArrayBuffer(s, 4, s.length / 4, gl.DYNAMIC_DRAW);
            this._a_lonlat_rotation_buffer = h.createArrayBuffer(c, 3, c.length / 3, gl.DYNAMIC_DRAW);
        },

        render: function (outData, tileData) {

            this._createBuffers(tileData);

            var h = this._handler,
                gl = h.gl;

            h.programs.billboard.activate();
            var sh = h.programs.billboard._program;
            var sha = sh.attributes,
                shu = sh.uniforms;

            this._framebuffer.activate();

            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);

            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._textureAtlas.texture);

            gl.uniform1i(shu.u_texture, 0);

            var b = tileData.topLeft.bounds;

            gl.uniform4fv(shu.extentParams, new Float32Array([b.min.x, b.min.y, 2.0 / (b.max.x - b.min.x), 2.0 / (b.max.y - b.min.y)]));

            gl.bindBuffer(gl.ARRAY_BUFFER, this._a_vert_tex_buffer);
            gl.vertexAttribPointer(sha.a_vert_tex, this._a_vert_tex_buffer.itemSize, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._a_lonlat_rotation_buffer);
            gl.vertexAttribPointer(sha.a_lonlat_rotation, this._a_lonlat_rotation_buffer.itemSize, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._a_size_offset_buffer);
            gl.vertexAttribPointer(sha.a_size_offset, this._a_size_offset_buffer.itemSize, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.TRIANGLES, 0, this._a_vert_tex_buffer.numItems);

            this._framebuffer.deactivate();

            return this._framebuffer.readAllPixels(outData);
        }
    };

    var publicInterface = {
        pluginName: pluginName,
        afterViewer: function (params) {
            this.load(params.aisIDs);
        },
        load: function (aisIDs) {

            aisIDs = aisIDs || '8EE2C7996800458AAF70BABB43321FA4';

            var arr = aisIDs.split(','),
                path = publicInterface.path,
                prefix = path + publicInterface.pluginName;

            Promise.all([
                path + 'og.webgl.ais.js',
                serverBase + 'api/plugins/agro_plugins_api_v2/themesModule/shared.js'
            ].map(L.gmxUtil.requestLink)).then(function () {

                var tileRender = new AISTileRender();
                tileRender.initialize();

                aisIDs.split(',').map(function (id) {

                    var gmxLayer = nsGmx.gmxMap.layersByID[id.trim()];

                    if (gmxLayer) {

                        tileRender.createTextureAtlas(gmxLayer.getStyles());

                        var _dataCache = {};

                        gmxLayer.addPreRenderHook(function (tile, info) {
                            info.skipDraw = true;
                            var id = info.x + ':' + info.y + ':' + info.z;
                            if (tile) {
                                var _data = new Uint8Array(256 * 256 * 4);
                                tileRender.render(_data, info);
                                _dataCache[id] = _data;
                            }
                        });

                        gmxLayer.addRenderHook(function (tile, info) {
                            var id = info.x + ':' + info.y + ':' + info.z;
                            if (_dataCache[id]) {
                                var context = tile.getContext('2d');
                                var imageData = context.createImageData(tile.width, tile.height);
                                imageData.data.set(_dataCache[id]);
                                context.putImageData(imageData, 0, 0);
                            }
                        });
                    }
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
