import {AxiosStatic,AxiosInstance} from 'axios'
import axios from 'axios';
import FileManager,{RemoteFile,RemoteFileMeta} from '../lib/filemanager'
import OSS from 'ali-oss'
import * as path from 'path'

export interface FileCRUD{
    fileList(obj:FileManager): Promise<RemoteFile[]>;
    getContent(filePath:string): Promise<string>;
    delete(filePath:string): Promise<void>;
    upload(uploadPath:string,content:string): Promise<RemoteFileMeta>;
    uploadImage(file:File):Promise<string>
}

export  class Cms implements FileCRUD{
    url: string;
    service: AxiosInstance;
    authorize:string;
    constructor(url: string,authorize:string){

        this.service = axios.create({
            baseURL: url,
            timeout: 30000,
            // withCredentials: true,
        })
        this.service.interceptors.request.use(function (config) {
            // let user = JSON.parse(window.sessionStorage.getItem('access-user'));
            // if (user) {
            //     token = user.token;
            // }
            var token = localStorage.getItem('Authorization');
            // let user = JSON.parse(localStorage.getItem("user"));
            // if(user){
                config.headers["authorizeSDK"] =authorize
            // }
            // if (token) {
            //     service.defaults.headers.common["Authorization"] = "Bearer " + token;
            //     console.log(token)
            // }
            // config.headers.common["Authorization"] = "Bearer " + token;
            //console.dir(config);
            return config;
        }, function (error) {
            // Do something with request error
            // console.info("error: ");
            // message.error(error);
            return Promise.reject(error);
        });
        this.service.interceptors.response.use(
            response => {
                return response;
            }, error => {
                // const response = error.response
                // const data = response ? response.data : null
                // if (data) {
                //     // console.log(data)
                //     if (data.status === 401) {
                //         localStorage.removeItem('Authorization');
                //         localStorage.removeItem("user");
                //         router.push("/login")
                //         message.error(data.message);
                //     } else {
                //         if (data.message) {
                //             message.error(data.message);
                //         } else {
                //             message.error('error --interceptors');
                //         }
        
                //     }
                //     //console.log(data)
                // }
                return Promise.reject(error)
            }
        )
    }
    async uploadImage(file:File): Promise<string> {
      
       const formData = new FormData();
       formData.append('file',file);
    //    console.log(formData)
        const res = await this.service.request({
            url: '/api/attachment/upload',
            data: formData,
            method: 'POST'
        })
        const url = res.data.data.path;
        return url
        	// axios({
			// 	url: `${this.settings.url}/api/attachment/upload`,
			// 	method: 'POST',
			// 	data: formData,
			// 	headers:{'authorizeSDK':this.settings.authorizeSDK}
			// }).then(res => {
			// 	// Get response public URL of uploaded image
			// 	console.log(res.data.data.path);
			// 	// const url = objectPath.get(res.data, 'secure_url')
			// 	const url = res.data.data.path;
			// 	const imgMarkdownText = `![](${url})`
			// 	// Show MD syntax using uploaded image URL, in Obsidian Editor
			// 	this.replaceText(editor, pastePlaceText, imgMarkdownText)
			// }, err => {
			// 	// Fail otherwise
			// 	new Notice(err, 5000)
			// 	console.log(err)
			// })
    }
    delete(filePath:string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    upload(uploadPath:string,content:string): Promise<RemoteFileMeta> {
        throw new Error('Method not implemented.');
    }
    getContent(filePath:string): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async fileList(obj:FileManager): Promise<RemoteFile[]> {
        const articleList = await this.service.request({
            url: '/api/article',
            params: {},
            method: 'get'
        })
        return articleList.data.data.content.map((content: { path: string; title: string; updateDate: any })=>new RemoteFile(obj,{
            path:content.path+"/"+content.title+".md",
            md5hash:"aaaaaaaaaaaaaaaaaaaaaa111",
            lastModified:content.updateDate
          }))
    }
    


}

export interface BucketOption {
    bucketName: string
    pathPrefix: string
    region: string
    endpoint: string
    accessKeyId: string
      accessKeySecret: string
}

export  class AliYunOSS implements FileCRUD{
    url: string;
    service: AxiosInstance;
    authorize:string;
    oss:OSS;
    constructor(bucketOpt:BucketOption){
        this.oss = new OSS({
            // yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
            region: bucketOpt.region, //"oss-cn-beijing"
            // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
            accessKeyId:bucketOpt.accessKeyId,
            accessKeySecret: bucketOpt.accessKeySecret,
            bucket:bucketOpt.bucketName //XXX-bucket
            
          });
    }
    uploadImage(file:File): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async getContent(filePath:string): Promise<string> {
        let result = await this.oss.get( filePath);
        return result.content
    }
    async delete(filePath:string): Promise<void> {
        try {
          // 填写Object完整路径。Object完整路径中不能包含Bucket名称。
          let result = await this.oss.delete(filePath);
          // console.log(result);
        } catch (e) {
          console.log(e);
        }
    }
    async upload(uploadPath:string,content:string): Promise<RemoteFileMeta> {
        // const headers = {
        //   // // 指定该Object被下载时的网页缓存行为。
        //   // 'Cache-Control': 'no-cache',
        //   // // 指定该Object被下载时的名称.
        //   // 'Content-Disposition': 'oss_download.txt',
        //   // // 指定Object的访问权限。
        //   // 'x-oss-object-acl': 'private',
        //   // // 指定Object的存储类型。
        //   // 'x-oss-storage-class': 'Standard',
        //   // // 该请求头用于检查消息内容是否与发送时一致。
        //   // // Content-MD5值可通过对消息内容（不包括头部）执行MD5算法，获得128比特位数字，然后对该数字进行base64编码。
        //   'Content-MD5': Buffer.from(this.md5hash, 'hex').toString('base64'),
        //   // // 设置过期时间。
        //   // 'Expires': 'Fri, 31 Dec 2021 16:57:01 GMT',
        //   // // 指定服务器端加密方式。此处指定为OSS完全托管密钥进行加密（SSE-OSS）。
        //   // 'x-oss-server-side-encryption': 'AES256',
        //   // // 指定该Object的内容编码格式。
        //   // 'Content-Encoding': 'utf-8',
        // };
  
     
        try {
          let result = await this.oss.put(uploadPath,Buffer.from(content));
          // console.log(result);
        } catch (e) {
          console.log(e);
        }
        return new RemoteFileMeta( "","",new Date())
    }
    async fileList(obj:FileManager): Promise<RemoteFile[]> {
        // const s3 = this.getS3Client()
        let result = await this.oss.list({"max-keys": 1000,"prefix": 'Obsidian/'},null);
        return result.objects.map(content => new RemoteFile(obj,{
          path:content.name,
          md5hash:JSON.parse(content.etag).toLowerCase(),
          lastModified: new Date(content.lastModified)
        }))
    
    }



}



// export default service