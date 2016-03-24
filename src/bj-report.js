/*!
 * @module report
 * @author kael, chriscai
 * @date @DATE
 * Copyright (c) 2014 kael, chriscai
 * Licensed under the MIT license.
 */
var BJ_REPORT = (function(global) {
    if (global.BJ_REPORT) return global.BJ_REPORT;

    var _error = [];
    // 默认配置
    var _config = {
        id: 0, // 上传id，申请时生成的数字，默认从1开始累加
        uin: 0, // 指定用户 number , (默认已经读取 qq uin)
        url: "", // 指定上报地址
        combo: 1, // combo 是否合并上报， 0 关闭， 1 启动（默认）
        ext: null, // 扩展属性，后端做扩展处理属性。例如：存在 msid 就会分发到 monitor.server.com
        level: 4, // 1-debug 2-info 4-error
        ignore: [], // 忽略某个错误 [/Script error/i]
        random: 1, // 抽样上报，1~0 之间数值，  1为100%上报  （默认 1）
        delay: 1000, // 当 combo= 1 可用，延迟多少毫秒，合并缓冲区中的上报（默认）
        submit: null
    };

    /**
     * 判断对象类型
     *
     * @param  {Object} o 对象
     * @param  {String} type 对象类型
     * @param  {Bool}
     *
     */
    var _isOBJByType = function(o, type) {
        return Object.prototype.toString.call(o) === "[object " + (type || "Object") + "]";
    };

    /**
     * 判断是否是对象
     *
     * @param  {Object} obj 对象
     * @param  {Bool}
     *
     */
    var _isOBJ = function(obj) {
        var type = typeof obj;
        return type === "object" && !!obj;
    };

    /**
     * 判断对象是否为空，数字对象，返回false
     *
     * @param  {Object} obj 对象
     * @param  {Bool}
     *
     */
    var _isEmpty = function(obj) {
        if (obj === null) return true;
        if (_isOBJByType(obj, 'Number')) {
            return false;
        }
        return !obj;
    };

    // global是window对象，存一下原始的window.onerror
    var orgError = global.onerror;
    // rewrite window.oerror
    global.onerror = function(msg, url, line, col, error) {
        var newMsg = msg;

        if (error && error.stack) {
            // 解析堆栈错误
            newMsg = _processStackMsg(error);
        }
        // 事件类型的错误，拼接错误类型，元素名字，元素的src值
        if (_isOBJByType(newMsg, "Event")) {
            newMsg += newMsg.type ? ("--" + newMsg.type + "--" + (newMsg.target ? (newMsg.target.tagName + "::" + newMsg.target.src) : "")) : "";
        }

        report.push({
            msg: newMsg,
            target: url,
            rowNum: line,
            colNum: col
        });

        _send();
        // 调用原始的window.onerror，传入参数
        orgError && orgError.apply(global, arguments);
    };

    /**
     * 解析错误对象
     *
     * @param  {Object} errObj 对象
     * @return  {Object} 解析后的错误对象
     *
     */
    var _processError = function(errObj) {
        try {
            if (errObj.stack) {
                var url = errObj.stack.match("https?://[^\n]+");
                url = url ? url[0] : "";
                var rowCols = url.match(":(\\d+):(\\d+)");
                if (!rowCols) {
                    rowCols = [0, 0, 0];
                }

                var stack = _processStackMsg(errObj);
                return {
                    msg: stack,
                    rowNum: rowCols[1],
                    colNum: rowCols[2],
                    target: url.replace(rowCols[0], "")
                };
            } else {
                //ie 独有 error 对象信息，try-catch 捕获到错误信息传过来，造成没有msg
                if (errObj.name && errObj.message && errObj.description) {
                    return {
                        msg: JSON.stringify(errObj)
                    };
                }
                return errObj;
            }
        } catch (err) {
            return errObj;
        }
    };

    /**
     * 解析错误对象堆栈信息
     *
     * @param  {Object} error 对象
     * @return  {Object} 解析后的错误对象字符串
     *
     */
    var _processStackMsg = function(error) {
        var stack = error.stack.replace(/\n/gi, "").split(/\bat\b/).slice(0, 5).join("@").replace(/\?[^:]+/gi, "");
        var msg = error.toString();
        if (stack.indexOf(msg) < 0) {
            stack = msg + "@" + stack;
        }
        return stack;
    };

    /**
     * 解析错误对象堆栈信息
     *
     * @param  {Object} error 对象
     * @param  {Number} index 错误索引
     *
     * @return  {Object} 解析后的错误对象字符串
     *
     */
    var _error_tostring = function(error, index) {
        var param = [];
        var params = [];
        var stringify = [];
        if (_isOBJ(error)) {
            error.level = error.level || _config.level;
            for (var key in error) {
                var value = error[key];
                if (!_isEmpty(value)) {
                    if (_isOBJ(value)) {
                        try {
                            value = JSON.stringify(value);
                        } catch (err) {
                            value = "[BJ_REPORT detect value stringify error] " + err.toString();
                        }
                    }
                    stringify.push(key + ":" + value);
                    param.push(key + "=" + encodeURIComponent(value));
                    params.push(key + "[" + index + "]=" + encodeURIComponent(value));
                }
            }
        }

        // msg[0]=msg&target[0]=target -- combo report
        // msg:msg,target:target -- ignore
        // msg=msg&target=target -- report with out combo
        return [params.join("&"), stringify.join(","), param.join("&")];
    };

    // 上报图片数组
    var _imgs = [];

    /**
     * 立即上报错误
     * @param  {String} url 上报地址
     *
     */
    var _submit = function(url) {
        // 如果有submit回调，执行外部参数的上报
        if (_config.submit) {
            _config.submit(url);
        } else {
            // 给图片的src赋值(上报)
            var _img = new Image();
            _imgs.push(_img);
            _img.src = url;
        }
    };

    // 错误列表
    var error_list = [];
    var comboTimeout = 0;

    /**
     * 上报错误，如果不是立即上报，则把错误信息插入error_list中
     * @param  {Bool} isReoprtNow 是否立即上报
     *
     */
    var _send = function(isReoprtNow) {
        if (!_config.report) return;

        while (_error.length) {
            var isIgnore = false;
            var error = _error.shift();
            var error_str = _error_tostring(error, error_list.length);
            if (_isOBJByType(_config.ignore, "Array")) {
                for (var i = 0, l = _config.ignore.length; i < l; i++) {
                    var rule = _config.ignore[i];
                    if ((_isOBJByType(rule, "RegExp") && rule.test(error_str[1])) ||
                        (_isOBJByType(rule, "Function") && rule(error, error_str[1]))) {
                        isIgnore = true;
                        break;
                    }
                }
            }
            if (!isIgnore) {
                // 默认合并错误
                if (_config.combo) {
                    error_list.push(error_str[0]);
                } else {
                    // 不合并上报，立即上报
                    _submit(_config.report + error_str[2] + "&_t=" + (+new Date));
                }

                // 使用外部传进来的上报方式
                _config.onReport && (_config.onReport(_config.id, error));
            }
        }

        // 合并上报
        var count = error_list.length;
        if (count) {
            var comboReport = function() {
                clearTimeout(comboTimeout);
                // 拼接错误数 参数
                _submit(_config.report + error_list.join("&") + "&count=" + error_list.length + "&_t=" + (+new Date));
                comboTimeout = 0;
                error_list = [];
            };

            if (isReoprtNow) {
                comboReport(); // 立即上报
            } else if (!comboTimeout) { // 延迟上报
                comboTimeout = setTimeout(comboReport, _config.delay); // 延迟上报
            }
        }
    };

    var report = {
        // 将错误推到缓存池
        push: function(msg) {
            // 抽样，随机数大于配置的随机数时，才上报
            // todo 抽样方法，暴露出去
            if (Math.random() >= _config.random) {
                return report;
            }

            var data = _isOBJ(msg) ? _processError(msg) : {
                msg: msg
            };
            // ext 有默认值, 且上报不包含 ext, 使用默认 ext
            if (_config.ext && !data.ext) {
                data.ext = _config.ext;
            }
            // 在全局_error数组中，添加错误
            _error.push(data);
            // 发送错误
            _send();
            return report;
        },
        // 上报错误，如果有错误对象，则插入_error中，然后立即上报
        report: function(msg) { // error report
            msg && report.push(msg);
            _send(true);
            return report;
        },
        // 2-info
        info: function(msg) { // info report
            if (!msg) {
                return report;
            }
            if (_isOBJ(msg)) {
                msg.level = 2;
            } else {
                msg = {
                    msg: msg,
                    level: 2
                };
            }
            report.push(msg);
            return report;
        },
        // 1-debug
        debug: function(msg) { // debug report
            if (!msg) {
                return report;
            }
            if (_isOBJ(msg)) {
                msg.level = 1;
            } else {
                msg = {
                    msg: msg,
                    level: 1
                };
            }
            report.push(msg);
            return report;
        },
        // 入口方法
        init: function(config) { // 初始化
            // 外部数据合并
            if (_isOBJ(config)) {
                for (var key in config) {
                    _config[key] = config[key];
                }
            }
            // 没有设置id将不上报，id为纯数字
            var id = parseInt(_config.id, 10);
            if (id) {
                // set default report url and uin， 如果是qq域名，则上报到badjs2.qq.com/badjs
                if (/qq\.com$/gi.test(location.hostname)) {
                    if (!_config.url) {
                        _config.url = "//badjs2.qq.com/badjs";
                    }

                    if (!_config.uin) {
                        _config.uin = parseInt((document.cookie.match(/\buin=\D+(\d+)/) || [])[1], 10);
                    }
                }

                _config.report = (_config.url || "/badjs") +
                    "?id=" + id +
                    "&uin=" + _config.uin +
                    "&from=" + encodeURIComponent(location.href) +
                    "&";
            }
            return report;
        },

        __onerror__: global.onerror
    };

    typeof console !== "undefined" && console.error && setTimeout(function() {
        var err = ((location.hash || '').match(/([#&])BJ_ERROR=([^&$]+)/) || [])[2];
        err && console.error("BJ_ERROR", decodeURIComponent(err).replace(/(:\d+:\d+)\s*/g, '$1\n'));
    }, 0);

    return report;

}(window));

if (typeof exports !== "undefined") {
    if (typeof module !== "undefined" && module.exports) {
        exports = module.exports = BJ_REPORT;
    }
    exports.BJ_REPORT = BJ_REPORT;
}
