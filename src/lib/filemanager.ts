import { TFile, Vault ,Editor} from 'obsidian'
import { S3Client, ListObjectsV2Command, _Object, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { AwsProfile } from './aws'
import * as path from 'path'
import * as crypto from 'crypto'
import { Readable } from 'stream'

import {Cms,FileCRUD,AliYunOSS,BucketOption} from '../utils/services'

export const UPLOAD_SYMBOL= '\u2191'
export const DOWNLOAD_SYMBOL= '\u2193'
export const DELETE_SYMBOL= '\u2715 ' // delete symbol is smaller then arrows

export abstract class File {
  fileManager: FileManager;

  path: string;
  extension: string;
  basename: string;
  md5hash: string;
  lastModified: Date

  abstract getContent(): Promise<string>
  abstract delete(): Promise<void>
}

export class LocalFile extends File {
  file: TFile;

  constructor(fileManager: FileManager, file: TFile) {
    super()

    this.fileManager = fileManager
    this.file = file

    this.basename = file.basename
    this.extension = file.extension
    this.path = file.path
    this.lastModified = new Date(file.stat.mtime)
  }

  async calculateMd5(): Promise<void> {
    // Skip MD% calculation for file bigger then 500mb
    if (this.getSizeInMb() > 500) {
      return
    }

    const md5hash = crypto.createHash('md5')
    const content = await this.getContent()
    if (content == null) {
      return
    }
    md5hash.update(Buffer.from(content, 'utf8'))
    this.md5hash = md5hash.digest('hex')
  }

  async getContent(): Promise<string|null> {
    try {
      const content = await this.fileManager.vault.read(this.file)
      return content.toString()
    } catch(err) {
      return null
    }
  }

  getSizeInKb(): number {
    return this.file.stat.size / 1024
  }

  getSizeInMb(): number {
    return this.getSizeInKb() / 1024
  }

  getSizeInGb(): number {
    return this.getSizeInMb() / 1024
  }

  async upload(): Promise<RemoteFile> {
    const content = await this.getContent()
    if (content === null) {
      return
    }
    const uploadPath = path.join(this.fileManager.bucketOpt.pathPrefix, this.path)
    let remoteFileMeta= await this.fileManager.fileCRUD.upload(uploadPath,content)
    return new RemoteFile(this.fileManager, remoteFileMeta)
       // const res = await s3.send(new PutObjectCommand({
    //   Bucket: this.fileManager.bucketOpt.bucketName,
    //   Key: uploadPath,
    //   Body: content,
    //   ContentMD5: Buffer.from(this.md5hash, 'hex').toString('base64')
    // }))
    // const res = await s3.put('exampleobject.txt', path.normalize('D:\\localpath\\examplefile.txt'));
    // return new RemoteFile(this.fileManager, {
    //   name: uploadPath,
    //   // ETag: res.ETag,
    //   lastModified:""
    // })
  }

  async delete(): Promise<void> {
    console.warn(`WARNING!! deleting local file ${this.path}`)
    await this.fileManager.vault.trash(this.file, true)
  }
}

export class RemoteFileMeta {
  path:string;
  md5hash: string;
  lastModified: Date;

  constructor(path: string,md5hash: string,lastModified: Date){
    this.path=path
    this.md5hash=md5hash
    this.lastModified=lastModified
  }
}

export class RemoteFile extends File {
  constructor(fileManager: FileManager, obj:RemoteFileMeta) {
    super()

    this.fileManager = fileManager

    this.path = obj.path.replace(this.fileManager.bucketOpt.pathPrefix, '')
    this.basename = path.basename(this.path)
    this.extension = path.extname(this.path)
    this.md5hash = obj.md5hash
    this.lastModified = obj.lastModified
  }

  async getContent(): Promise<string> {

    // const res = await s3.send(new GetObjectCommand({
    //   Bucket: this.fileManager.bucketOpt.bucketName,
    //   Key: path.join(this.fileManager.bucketOpt.pathPrefix, this.path),
    // }))

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // const readable = Readable.from(res.Body)
    // let content = ''
    // for await (const chunk of readable) {
    //   content += chunk
    // }
    let content= await this.fileManager.fileCRUD.getContent(path.join(this.fileManager.bucketOpt.pathPrefix, this.path))
    return content
  }

  async download(): Promise<LocalFile> {
    let localFile = this.fileManager.findLocalFile(this.path)
    if (localFile) {
      await this.fileManager.vault.modify(localFile.file, await this.getContent())
    } else {
      try {
        await this.fileManager.vault.createFolder(path.dirname(this.path))
      } catch (error) {
        // this raise an error is directory already exist
        // cannot find a method to check the directory existence
      }
      const file = await this.fileManager.vault.create(this.path, await this.getContent())
      localFile = new LocalFile(this.fileManager, file)
    }

    return localFile
  }

  async delete(): Promise<void> {
    await this.fileManager.fileCRUD.delete(path.join(this.fileManager.bucketOpt.pathPrefix, this.path))
    // await s3.send(new DeleteObjectCommand({
    //   Bucket: this.fileManager.bucketOpt.bucketName,
    //   Key: path.join(this.fileManager.bucketOpt.pathPrefix, this.path),
    // }))
  }
}

export interface SyncStat {
  filesToUpload: LocalFile[];
	filesToDownload: RemoteFile[];
	filesToDelete: File[];
}

export enum SyncDirection {
	FROM_LOCAL,
	FROM_REMOTE
}

export interface SyncOptions {
	direction: SyncDirection
	localFileProtection: boolean
}


export interface CmsOption{
  url:string;
	authorizeSDK:string;
}
export default class FileManager {
  vault: Vault;
  profile: AwsProfile;
  bucketOpt: BucketOption;
  syncOpt: SyncOptions;
  localFiles: LocalFile[];
  remoteFiles: RemoteFile[];
  cmsOpt:CmsOption;
  fileCRUD:FileCRUD;

  constructor(vault: Vault, cmsOpt:CmsOption,profile: AwsProfile, bucketOpt: BucketOption, syncOpt: SyncOptions) {
    this.vault = vault
    this.profile = profile
    this.bucketOpt = bucketOpt
    this.syncOpt = syncOpt
    this.cmsOpt=cmsOpt
    this.fileCRUD= new Cms(cmsOpt.url,cmsOpt.authorizeSDK);
    // this.fileCRUD = new AliYunOSS(bucketOpt);
    //TUDO
 
  }

  // getS3Client(): OSS {
   
  //   let client = new OSS({
  //     // yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  //     region: this.bucketOpt.region, //"oss-cn-beijing"
  //     // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
  //     accessKeyId: this.bucketOpt.accessKeyId,
  //     accessKeySecret: this.bucketOpt.accessKeySecret,
  //     bucket:this.bucketOpt.bucketName //XXX-bucket
      
  //   });
  //   // return new S3Client({
  //     // credentials: this.profile.getCredentials(),
  //   //   region: this.bucketOpt.region,
  //   //   endpoint: this.bucketOpt.endpoint || this.bucketOpt.endpoint.trim() !== '' ? this.bucketOpt.endpoint : undefined
  //   // })
  //   return client
  // }

  async loadLocalFiles(): Promise<LocalFile[]> {
    const files = this.vault.getFiles()
    this.localFiles = files.map((file: TFile) => new LocalFile(this, file))
    // console.log(this.localFiles)
    // Load content for md5 hash elaboration
    await Promise.all(this.localFiles.map(file => file.calculateMd5()))
    
    return this.localFiles
  }
  // async loadCmsArticle(){

  // }
  async loadRemoteFiles(): Promise<RemoteFile[]> {
    

    // console.log(result);
    // this.remoteFileOSS=result
    // return result
    // let contents: _Object[] = []

    // let continuationToken = undefined
    // let maxPages = 10
    // do {
    //   const res: ListObjectsV2CommandOutput = await s3.send(new ListObjectsV2Command({
    //     Bucket: this.bucketOpt.bucketName,
    //     Prefix: this.bucketOpt.pathPrefix,
    //     MaxKeys: 1000,
    //     ContinuationToken: continuationToken
    //   }))

    //   maxPages--
  
    //   if (!res.Contents) {
    //     break
    //   }

    //   contents = contents.concat(res.Contents)
    //   continuationToken = res.NextContinuationToken
      
    // } while (continuationToken !== undefined && maxPages > 0)
    this.remoteFiles = await this.fileCRUD.fileList(this)
    // console.log(this.remoteFiles)
  

    // console.log("loadRemoteFiles:------>" )
    // console.log(this.remoteFiles )
    return this.remoteFiles
    
  }
  async uploadImage(files:FileList,editor:Editor){
    // console.log(files)
    for (let file of files) {
			// const randomString = (Math.random() * 10086).toString(36).substr(0, 8)
			const pastePlaceText = `![uploading...]()\n`
			editor.replaceSelection(pastePlaceText) // Generate random string to show on editor screen while API call completes
			// console.log(pastePlaceText)
			// // Cloudinary request format
			// // Send form data with a file and upload preset
			// // Optionally define a folder
      // const formData = new FormData();
      // formData.append('file',file);
      const imgUrl = await this.fileCRUD.uploadImage(file)
      const imgMarkdownText = `![](${imgUrl})`
      this.replaceText(editor, pastePlaceText, imgMarkdownText)
			// formData.append('upload_preset',this.settings.uploadPreset);
			// formData.append('folder',this.settings.folder);

			// // // Make API call
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
  }
  findRemoteFile(path: string): RemoteFile | undefined {
    return this.remoteFiles.find(file => file.path === path)
  }

  findLocalFile(path: string): LocalFile | undefined {
    return this.localFiles.find(file => file.path === path)
  }

  getSyncStatus(direction?: SyncDirection | undefined): SyncStat | undefined {
    direction = direction !== undefined ? direction : this.syncOpt.direction
   

    if (!this.remoteFiles || !this.loadLocalFiles) {
      return undefined
    }

    const filesToDelete = []

    const filesToDownload = []
    for (const remoteFile of this.remoteFiles) {
      const localFile = this.findLocalFile(remoteFile.path)
      if (!localFile) {
        if (direction === SyncDirection.FROM_LOCAL) {
          filesToDelete.push(remoteFile)
        } else {
          // console.log("filesToDownload.push(remoteFile)")
          // console.log(remoteFile)
          filesToDownload.push(remoteFile)
        }
      } else if (localFile.md5hash && localFile.md5hash !== remoteFile.md5hash && remoteFile.lastModified > localFile.lastModified) {
        filesToDownload.push(remoteFile)
      }
    }
    // console.log("getSyncStatus filesToDownload:--------->"+direction+"-"+SyncDirection.FROM_LOCAL)
    // console.log(filesToDownload)
    // console.log(filesToDelete)
    // console.log(this.remoteFiles)
    // console.log(this.localFiles)
    const filesToUpload = []
    for (const localFile of this.localFiles) {
      const remoteFile = this.findRemoteFile(localFile.path)
      if (!remoteFile) {
        if (this.syncOpt.localFileProtection === false && this.syncOpt.direction === SyncDirection.FROM_REMOTE) {
          filesToDelete.push(localFile)
        } else if (localFile.getSizeInGb() < 1) { // need to support multipart upload
          filesToUpload.push(localFile)
        }
      } else if (localFile.md5hash && remoteFile.md5hash !== localFile.md5hash && localFile.lastModified > remoteFile.lastModified) {
        filesToUpload.push(localFile)
      }
    }

    return {
      filesToDownload,
      filesToUpload,
      filesToDelete
    }
  }

  isInSync(): boolean {
    const status = this.getSyncStatus()
    return status.filesToDelete.length === 0 && status.filesToUpload.length === 0 && status.filesToDownload.length === 0
  }

  async sync(direction?: SyncDirection | undefined): Promise<void> {
    console.log("sync:->>>>>>>>>>>>"+direction)
    const stats = this.getSyncStatus(direction)
    console.log(stats)
    const parallel = 10
    
    for (let i = 0; i < stats.filesToDownload.length; i += parallel) {
      const chunk = stats.filesToDownload.slice(i, i + parallel)
      await Promise.all(chunk.map(file => file.download()))
    }

    for (let i = 0; i < stats.filesToUpload.length; i += parallel) {
      const chunk = stats.filesToUpload.slice(i, i + parallel)
      await Promise.all(chunk.map(file => file.upload()))
    }

    for (let i = 0; i < stats.filesToDelete.length; i += parallel) {
      const chunk = stats.filesToDelete.slice(i, i + parallel)
      await Promise.all(chunk.map(file => file.delete()))
    }
  }

  replaceText(editor: Editor, target: string, replacement: string): void {
		target = target.trim();
		let lines = [];
		for (let i = 0; i < editor.lineCount(); i++){
		  lines.push(editor.getLine(i));
		}
		//const tlines = editor.getValue().split("\n");
		for (let i = 0; i < lines.length; i++) {
		  const ch = lines[i].indexOf(target)
		  if (ch !== -1) {
			const from = { line: i, ch };
			const to = { line: i, ch: ch + target.length };
			editor.replaceRange(replacement, from, to);
			break;
		  }
		}
	}
}
