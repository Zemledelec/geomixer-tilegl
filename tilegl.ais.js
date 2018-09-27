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

        this._markerTexture = null;
    };

    AISTileRender.prototype = {

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
                'attribute vec4 a_vert_tex;\n\
                attribute vec3 a_lonlat_rotation;\n\
                attribute vec4 a_size_offset;\n\
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
                    \n\
                    vec2 pp = vec2(c.x + shifted.x * cos(rot) - shifted.y * sin(rot),\n\
                                c.y + shifted.x * sin(rot) + shifted.y * cos(rot));\n\
                    \n\
                    gl_Position = vec4(pp, 0.0, 1.0); \n\
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

            var img = new Image(),
                _this = this;

            img.onload = function () {
                _this._markerTexture = _this._handler.createTexture_n(this);
            };

            img.src = "./plugins/tilegl/marker.png";
        },

        _createBuffers: function (tileData) {

            var h = this._handler,
                gl = h.gl;

            gl.deleteBuffer(this._a_vert_tex_buffer);
            gl.deleteBuffer(this._a_lonlat_rotation_buffer);
            gl.deleteBuffer(this._a_size_offset_buffer);

            var a_vert_tex_bufferArr = [],
                a_lonlat_rotation_bufferArr = [],
                a_size_offset_bufferArr = [];

            var geoItems = tileData.geoItems;

            var _w = 10.0, _h = 20.0,
                dx = 0.0, dy = 0.0;

            for (var i = 0; i < geoItems.length; i++) {

                var prop = geoItems[i].properties,
                    lon = prop[34].coordinates[0],
                    lat = prop[34].coordinates[1],
                    rot = prop[19];

                a_vert_tex_bufferArr.push(
                    -0.5, -0.5, 0.0, 0.0,
                    -0.5, 0.5, 0.0, 1.0,
                    0.5, 0.5, 1.0, 1.0,

                    -0.5, -0.5, 0.0, 0.0,
                    0.5, 0.5, 1.0, 1.0,
                    0.5, -0.5, 1.0, 0.0
                );

                a_size_offset_bufferArr.push(
                    _w, _h, dx, dy,
                    _w, _h, dx, dy,
                    _w, _h, dx, dy,

                    _w, _h, dx, dy,
                    _w, _h, dx, dy,
                    _w, _h, dx, dy
                );

                a_lonlat_rotation_bufferArr.push(
                    lon, lat, rot,
                    lon, lat, rot,
                    lon, lat, rot,

                    lon, lat, rot,
                    lon, lat, rot,
                    lon, lat, rot
                );
            }

            this._a_vert_tex_buffer = h.createArrayBuffer(new Float32Array(a_vert_tex_bufferArr), 4, a_vert_tex_bufferArr.length / 4, gl.DYNAMIC_DRAW);
            this._a_lonlat_rotation_buffer = h.createArrayBuffer(new Float32Array(a_lonlat_rotation_bufferArr), 3, a_lonlat_rotation_bufferArr.length / 3, gl.DYNAMIC_DRAW);
            this._a_size_offset_buffer = h.createArrayBuffer(new Float32Array(a_size_offset_bufferArr), 4, a_size_offset_bufferArr.length / 4, gl.DYNAMIC_DRAW);
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
            gl.bindTexture(gl.TEXTURE_2D, this._markerTexture);

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
