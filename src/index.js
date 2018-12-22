/**
 * @file serviceWorker register no-cache solution
 * @author mj(zoumiaojiang@gmail.com)
 */

const etpl = require('etpl')
const fs = require('fs')
const path = require('path')

let cwd = process.cwd()

/**
 * 对于小于 100 的数字向左补全0
 *
 * @param  {number} value 数字
 * @return {string}       补全后的字符串
 */
function padding (value) {
  return value < 10 ? `0${value}` : value
}

/**
 * 获取时间戳版本号
 *
 * @return {string} 版本号
 */
function getVersion () {
  let d = new Date()

  return '' +
    d.getFullYear() +
    padding(d.getMonth() + 1) +
    padding(d.getDate()) +
    padding(d.getHours()) +
    padding(d.getMinutes()) +
    padding(d.getSeconds())
}

/**
 * 判断是否符合指定的规则
 *
 * @param {string} asset 捕获的文件名
 * @param {Array} rules 规则列表
 * @return {boolean} 判断的结果
 */
function isIn (asset, rules) {
  for (let i = 0, len = rules.length; i < len; i++) {
    let rule = rules[i]
    if (typeof rule === 'function' && rule.call(this, asset)) {
      return true
    } else if (typeof rule === 'object' && rule instanceof RegExp && rule.test(asset)) {
      return true
    } else if (typeof rule === 'string' && asset.endsWith(rule)) {
      return true
    }
  }

  return false
}

/* eslint-disable fecs-prefer-class */
/**
 * sw Register 插件
 *
 * @constructor
 * @param {Object} options 参数
 */
function SwRegisterPlugin (options = {}) {
  let filePath = path.resolve(cwd, (options.filePath || './src/sw-register.js'))

  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(__dirname, 'templates', 'sw-register.js')
  }
  this.filePath = filePath
  this.fileName = options.output || path.basename(filePath)
  this.version = options.version || getVersion()
  this.prefix = options.prefix
  this.excludes = options.excludes || []
  this.includes = options.includes || []
  this.scope = options.scope || '/'
  this.entries = options.entries || []
  this.entriesInfo = {}
}

/* eslint-enable fecs-prefer-class */

SwRegisterPlugin.prototype.apply = function (compiler) {
  let me = this
  let swRegisterEntryFilePath = path.resolve(__dirname, 'templates', 'sw-register-entry.js.tpl')
  let swRegisterFilePath = me.filePath

  compiler.plugin('emit', (compilation, callback) => {
    let prefix = me.prefix || compilation.outputOptions.publicPath || ''
    if (!/\/$/.test(prefix)) {
      prefix = prefix + '/'
    }

    let con = fs.readFileSync(swRegisterFilePath, 'utf-8')

    if (me.entries.length === 0) {
      if (me.scope !== '/') {
        con = con.replace(/\.register\(([^)]+)\)/, `.register($1, {scope: '${me.scope}'})`)
      }

      compilation.assets[me.fileName] = {
        source () {
          return con
        },
        size () {
          return con.length
        }
      }
    } else {
      me.entries.forEach(entryConfig => {
        let entryName = entryConfig.name
        let swName = entryConfig.serviceWorker.swName || `/${entryName}/service-worker.js`
        let swRegisterName = entryConfig.serviceWorker.swRegisterName || `${entryName}/${me.fileName}`
        let scope = entryConfig.serviceWorker.scope

        if (!scope) {
          scope = entryConfig.urlReg.toString() === '/^\\//' ? '/' : `/${entryName}/`
        }

        me.entriesInfo[entryName] = { swName, swRegisterName, scope }

        // add scope to register
        let entryContent = con.replace(/\.register\(([^)]+)\)/, `.register($1, {scope: '${scope}'})`)
          .replace('/service-worker.js', '/' + swName)

        compilation.assets[`${entryName}/${me.fileName}`] = {
          source () {
            return entryContent
          },
          size () {
            return entryContent.length
          }
        }
      })
    }

    Object.keys(compilation.assets).forEach(asset => {
      // 默认会给每个 html 文件添加 sw-register.js
      // 如果指定了不用添加 sw-register.js 的话，可以在 excludes 参数中指定
      // 接受三种形式的值：字符串，正则表达式，回调函数
      if (!isIn(asset, me.excludes) && (/\.html$/.test(asset) || isIn(asset, me.includes))) {
        let htmlContent = compilation.assets[asset].source().toString()
        let swRegisterEntryFileTpl = fs.readFileSync(swRegisterEntryFilePath, 'utf-8')
        let swRegisterEntryFileContent

        if (me.entries.length !== 0) {
          let entryName = asset.match(/(.+?)\/(.+?)\.html$/)[1]
          let entryInfo = me.entriesInfo[entryName]

          swRegisterEntryFileContent = etpl.compile(swRegisterEntryFileTpl)({
            publicPath: me.publicPath,
            fileName: entryInfo.swRegisterName
          })
        } else {
          swRegisterEntryFileContent = etpl.compile(swRegisterEntryFileTpl)(me)
        }

        htmlContent = htmlContent.replace(/<\/body>/, `${swRegisterEntryFileContent}</body>`)

        compilation.assets[asset] = {
          source () {
            return htmlContent
          },
          size () {
            return htmlContent.length
          }
        }
      }
    })

    callback()
  })
}

module.exports = SwRegisterPlugin
