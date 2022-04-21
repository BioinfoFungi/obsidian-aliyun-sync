import { TFile, Vault } from 'obsidian'
import { S3Client, ListObjectsV2Command, _Object, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { AwsProfile } from './aws'
import * as path from 'path'
import * as crypto from 'crypto'
import { Readable } from 'stream'
import OSS from 'ali-oss'

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
    console.log( this.path+"--------"+this.md5hash)
    const headers = {
      // // 指定该Object被下载时的网页缓存行为。
      // 'Cache-Control': 'no-cache',
      // // 指定该Object被下载时的名称.
      // 'Content-Disposition': 'oss_download.txt',
      // // 指定Object的访问权限。
      // 'x-oss-object-acl': 'private',
      // // 指定Object的存储类型。
      // 'x-oss-storage-class': 'Standard',
      // // 该请求头用于检查消息内容是否与发送时一致。
      // // Content-MD5值可通过对消息内容（不包括头部）执行MD5算法，获得128比特位数字，然后对该数字进行base64编码。
      'Content-MD5': Buffer.from(this.md5hash, 'hex').toString('base64'),
      // // 设置过期时间。
      // 'Expires': 'Fri, 31 Dec 2021 16:57:01 GMT',
      // // 指定服务器端加密方式。此处指定为OSS完全托管密钥进行加密（SSE-OSS）。
      // 'x-oss-server-side-encryption': 'AES256',
      // // 指定该Object的内容编码格式。
      // 'Content-Encoding': 'utf-8',
    };
    const s3 = this.fileManager.getS3Client()
    const uploadPath = path.join(this.fileManager.bucketOpt.pathPrefix, this.path)
    // const res = await s3.send(new PutObjectCommand({
    //   Bucket: this.fileManager.bucketOpt.bucketName,
    //   Key: uploadPath,
    //   Body: content,
    //   ContentMD5: Buffer.from(this.md5hash, 'hex').toString('base64')
    // }))
    try {
      let result = await s3.put(uploadPath,Buffer.from(content),{headers});
      // console.log(result);
    } catch (e) {
      console.log(e);
    }
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

export class OSSObj {
  etag: string;
  lastModified: Date;
  url: string;
  size: string;

  constructor(etag: string,lastModified: Date,url: string,size: string){
    this.etag=etag
    this.lastModified=lastModified
    this.url=url
    this.size=size
  }
}

export class RemoteFile extends File {
  constructor(fileManager: FileManager, obj:OSS.ObjectMeta) {
    super()

    this.fileManager = fileManager

    this.path = obj.name.replace(this.fileManager.bucketOpt.pathPrefix, '')
    this.basename = path.basename(this.path)
    this.extension = path.extname(this.path)
    this.md5hash = JSON.parse(obj.etag).toLowerCase()
    this.lastModified = new Date(obj.lastModified)
  }

  async getContent(): Promise<string> {
    const s3 = this.fileManager.getS3Client()

    // const res = await s3.send(new GetObjectCommand({
    //   Bucket: this.fileManager.bucketOpt.bucketName,
    //   Key: path.join(this.fileManager.bucketOpt.pathPrefix, this.path),
    // }))
    let result = await s3.get( path.join(this.fileManager.bucketOpt.pathPrefix, this.path));
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // const readable = Readable.from(res.Body)
    // let content = ''
    // for await (const chunk of readable) {
    //   content += chunk
    // }
    let content=result.content
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
    const s3 = this.fileManager.getS3Client()
    try {
      // 填写Object完整路径。Object完整路径中不能包含Bucket名称。
      let result = await s3.delete(path.join(this.fileManager.bucketOpt.pathPrefix, this.path));
      // console.log(result);
    } catch (e) {
      console.log(e);
    }
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

export interface BucketOption {
  bucketName: string
  pathPrefix: string
  region: string
  endpoint: string
  accessKeyId: string
	accessKeySecret: string
}

export default class FileManager {
  vault: Vault;
  profile: AwsProfile;
  bucketOpt: BucketOption;
  syncOpt: SyncOptions;
  localFiles: LocalFile[];
  remoteFiles: RemoteFile[];

  constructor(vault: Vault, profile: AwsProfile, bucketOpt: BucketOption, syncOpt: SyncOptions) {
    this.vault = vault
    this.profile = profile
    this.bucketOpt = bucketOpt
    this.syncOpt = syncOpt
  }

  getS3Client(): OSS {
    console.log(this)
    let client = new OSS({
      // yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
      region: this.bucketOpt.region, //"oss-cn-beijing"
      // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
      accessKeyId: this.bucketOpt.accessKeyId,
      accessKeySecret: this.bucketOpt.accessKeySecret,
      bucket:this.bucketOpt.bucketName //XXX-bucket
      
    });
    // return new S3Client({
      // credentials: this.profile.getCredentials(),
    //   region: this.bucketOpt.region,
    //   endpoint: this.bucketOpt.endpoint || this.bucketOpt.endpoint.trim() !== '' ? this.bucketOpt.endpoint : undefined
    // })
    return client
  }

  async loadLocalFiles(): Promise<LocalFile[]> {
    const files = this.vault.getFiles()
    this.localFiles = files.map((file: TFile) => new LocalFile(this, file))
    // console.log(this.localFiles)
    // Load content for md5 hash elaboration
    await Promise.all(this.localFiles.map(file => file.calculateMd5()))
    
    return this.localFiles
  }

  async loadRemoteFiles(): Promise<RemoteFile[]> {
    const s3 = this.getS3Client()
    // console.log(s3)

    let result = await s3.list({"max-keys": 1000,"prefix": 'Obsidian/'},null);
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

    
    this.remoteFiles = result.objects.map(content => new RemoteFile(this,content))
    // console.log("loadRemoteFiles:------>" )
    // console.log(this.remoteFiles )
    return this.remoteFiles
    
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

}
