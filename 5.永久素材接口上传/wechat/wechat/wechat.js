'use strict'

const Promise = require('bluebird');
const request = Promise.promisify(require('request'));
const _ = require('lodash');
const fs = require('fs');
const util = require('./util.js')

const prefix = 'https://api.weixin.qq.com/cgi-bin/';
var api = {
	accessToken: prefix + 'token?grant_type=client_credential',
	// 新增临时素材接口
	temporary: {
		upload: prefix + 'media/upload?'
	},
	// 新增永久素材接口
	permanent: {
		// 上传图片和视频素材
		upload: prefix + 'material/add_material?',
		// 上传图文素材
		uploadNews: prefix + 'material/add_news?',
		// 上传图文消息内的图片
		uploadNewsPic: prefix + 'media/uploadimg?'
	}
}
	

// 判断access_token(票据)是否过期
function Wechat(options) {
	var that = this;
	this.AppID = options.AppID;
	this.AppSecret = options.AppSecret;
	// 获取票据[]
	this.getAccessToken = options.getAccessToken;
	// 存储票据
	this.saveAccessToken = options.saveAccessToken;

	this.getAccessToken()
		.then(function(data) {
			try {  // 票据内容JSON化
				data = JSON.parse(data);
			}
			catch(e) {
				// 文件异常或非法,则更新票据
				return that.updateAccessToken();
			}
			// 合法性检查
			if (that.isValidAccessToken(data)) {
				// 返回票据
				return Promise.resolve(data);
			} else {
				// 非法或过期,更新票据
				return that.updateAccessToken();
			}

		})  
		.then (function(data) {
			that.access_token = data.access_token;
			that.expires_in = data.expires_in;  // 过期字段

			that.saveAccessToken(data);  // 存储票据
		})
}
// 原型中加入合法性检查方法
Wechat.prototype.isValidAccessToken = function(data) {
	if (!data || !data.access_token || !data.expires_in) {
		return false;    // 不合法返回false
	}
	// 获取票据
	var access_token = data.access_token;
	// 获取过期时间
	var expires_in = data.expires_in;
	// 获取当前时间
	var now = (new Date().getTime());

	if (now < expires_in){
		return true;
	} else {
		return false;
	}
}

// 跟新票据的方法
Wechat.prototype.updateAccessToken = function() {
	var AppID = this.AppID;
	var AppSecret = this.AppSecret;
	var url	= api.accessToken + '&appid=' + AppID + '&secret=' + AppSecret;

	return new Promise(function(resolve, reject) {
		request({ url:url, json: true}).then(function(response) {
			var data = response.body;
			var now = (new Date().getTime());
			// 更新数据时,有效时间缩短20秒(提前20秒更新)
			var expires_in = now + (data.expires_in - 20) * 1000;
			data.expires_in = expires_in;	

			resolve(data);
		});
	});

}

Wechat.prototype.uploadMaterial = function(type, material, permanent) {
	var that = this;
	var form = {}
	// 默认为临时素材上传地址
	var uploadUrl = api.temporary.upload; 

	// 若传入了permanent参数，则为上传永久素材
	if (permanent) {
		uploadUrl = api.permanent.upload;

		// form兼容所有的上传类型,包括图文类型
		_.extend(form, permanent);  // 继承permanent对象
	}

	if (type === 'pic') {
		// 图文消息中要上传的图片
		uploadUrl = api.permanent.uploadNewsPic;
	}

	if (type === 'news') {
		// 上传图文
		uploadUrl = api.permanent.uploadNews;
		form = material;
	} else {
		form.media = fs.createReadStream(material);
	}

	return new Promise(function(resolve, reject) {
		that
		  .fetchAccessToken()  // 获取全局票据
			.then(function(data) {
				var url = uploadUrl + 'access_token=' + data.access_token;

				if (!permanent) {
					url += '&type=' + type;
				} else {
					form.access_token = data.access_token;
				}

				var options = {
					method: 'POST',
					url: url,
					json: true
				}

				if (type === 'news') {
					options.body = form;
				} else {
					options.formData = form;
				}

				// POST请求
				request({method: 'POST', url: url, formData: form, json:true}).then(function(response) {
					var _data = response.body;
					console.log(_data);
					if (_data) {
						resolve(_data);
					} else {
						throw new Error('Upload material fails');
					}
				})
				.catch(function(err) {
					reject(err);
				});
			});

	});
}

Wechat.prototype.fetchAccessToken = function() {
	var that = this;

	if (this.access_token && this.expires_in) {
		if (this.isValidAccessToken(this)) {
			return Promise.resolve(this);
		}
	}

	return that.getAccessToken()
		.then(function(data) {
			try {  // 票据内容JSON化
				data = JSON.parse(data);
			}
			catch(e) {
				// 文件异常或非法,则更新票据
				return that.updateAccessToken();
			}
			// 合法性检查
			if (that.isValidAccessToken(data)) {
				// 返回票据
				return Promise.resolve(data);
			} else {
				// 非法或过期,更新票据
				return that.updateAccessToken();
			}

		})  
		.then (function(data) {
			that.access_token = data.access_token;
			that.expires_in = data.expires_in;  // 过期字段

			that.saveAccessToken(data);  // 存储票据

			return Promise.resolve(data);
		});
}

// reply通过call上下文已经改变，this指向g.js
Wechat.prototype.reply = function() {
	// 获取回复的内容
	var content = this.body;
	// 获取g.js的weixin属性的内容
	var message = this.weixin;
	// 控制台打印回复的内容
	console.log(content);
	// 通过util工具函数，生成需要的xml结构，进行回复
	var xml = util.tpl(content, message);

	// 回复的状态
	this.status = 200;
	// 回复的类型
	this.type = 'application/xml'
	// 回复的内容
	this.body = xml;
}

module.exports = Wechat;