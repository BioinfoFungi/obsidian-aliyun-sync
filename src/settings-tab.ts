import { App, PluginSettingTab, Setting } from 'obsidian'
import AwsSyncPlugin from './main'
// import { AwsProfile, REGIONS } from './lib/aws'
import { SyncDirection } from './lib/filemanager'

export default class AwsSyncSettingTab extends PluginSettingTab {
	plugin: AwsSyncPlugin;

	constructor(app: App, plugin: AwsSyncPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	async display(): Promise<void> {
		const {containerEl} = this

		containerEl.empty()
		new Setting(containerEl)
				.setName('CMS-OSS')
				.setDesc('CMS-OSS')
				.addDropdown(dropdown => dropdown
					.addOptions({"CMS":"CMS"})
					.addOptions({"OSS":"OSS"})
					.setValue(this.plugin.settings.db)
					.onChange(async (value) => {
						this.plugin.settings.db = value
						await this.plugin.saveSettings()
					}))
	

		new Setting(containerEl)
		.setName('url')
		.setDesc('url')
		.addText(text => text
			.setValue(this.plugin.settings.url)
			.setPlaceholder('REQUIRED')
			.onChange(async (value) => {
				this.plugin.settings.url = value
				await this.plugin.saveSettings()
			}))

			new Setting(containerEl)
			.setName('authorizeSDK')
			.setDesc('authorizeSDK')
			.addText(text => text
				.setValue(this.plugin.settings.authorizeSDK)
				.setPlaceholder('REQUIRED')
				.onChange(async (value) => {
					this.plugin.settings.authorizeSDK = value
					await this.plugin.saveSettings()
				}))


		// const profiles = await this.plugin.awsCredentials.loadProfiles()
		// if (profiles.length > 0) {
		// 	new Setting(containerEl)
		// 		.setName('AWS Profile')
		// 		.setDesc('The name AWS profile name configured in credentials file')
		// 		.addDropdown(dropdown => dropdown
		// 			.addOptions(profiles.reduce((acc: {[key: string]: string}, profile: AwsProfile) => {
		// 				acc[profile.name] = profile.name
		// 				return acc
		// 			}, {}))
		// 			.setValue(this.plugin.settings.profile)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.profile = value
		// 				await this.plugin.saveSettings()
		// 			}))
		// } else {
		// 	containerEl.createEl('p', {text: 'Cloud not find any AWS profiles!', cls: ['setting-item', 'aws-s3-sync-no-profile']})
		// }


    new Setting(containerEl)
      .setName('AWS Region')
      .setDesc('The region where S3 bucket was created')
      .addDropdown(dropdown => dropdown
        .addOptions(REGIONS)
        .setValue(this.plugin.settings.region)
        .onChange(async (value) => {
          this.plugin.settings.region = value
          await this.plugin.saveSettings()
        }))

		new Setting(containerEl)
			.setName('AWS S3 Bucket Name')
			.setDesc('The name of the AWS S3 bucket')
			.addText(text => text
				.setValue(this.plugin.settings.bucketName)
				.setPlaceholder('REQUIRED')
				.onChange(async (value) => {
					this.plugin.settings.bucketName = value
					await this.plugin.saveSettings()
				}))
	new Setting(containerEl)
		.setName('accessKeyId')
		.setDesc('accessKeyId')
		.addText(text => text
			.setValue(this.plugin.settings.accessKeyId)
			.setPlaceholder('REQUIRED')
			.onChange(async (value) => {
				this.plugin.settings.accessKeyId = value
				await this.plugin.saveSettings()
			}))
	new Setting(containerEl)
		.setName('accessKeySecret')
		.setDesc('accessKeySecret')
		.addText(text => text
			.setValue(this.plugin.settings.accessKeySecret)
			.setPlaceholder('REQUIRED')
			.onChange(async (value) => {
				this.plugin.settings.accessKeySecret = value
				await this.plugin.saveSettings()
			}))

		new Setting(containerEl)
			.setName('AWS S3 Objects Path Prefix')
			.setDesc('The prefix of uploaded objects to the AWS S3 bucket')
			.addText(text => text
				.setPlaceholder('use %VAULT_NAME% as placeholder')
				.setValue(this.plugin.settings.bucketPathPrefix)
				.onChange(async (value) => {
					this.plugin.settings.bucketPathPrefix = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('AWS S3 Bucket Endpoint')
			.setDesc('The fully qualified endpoint of the webservice, leave empty to use the AWS S3\'s default')
			.addText(text => text
				.setValue(this.plugin.settings.bucketEndpoint)
				.setPlaceholder(`${this.plugin.settings.bucketName}.s3.${this.plugin.settings.region}.amazonaws.com`)
				.onChange(async (value) => {
					this.plugin.settings.bucketEndpoint = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Test configurations')
			.setDesc('Will check if credentials are valid and S3 bucket exist')
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					await this.plugin.runTest()
				}))

		new Setting(containerEl)
			.setName('Local file protection')
			.setDesc('Protect local files from deletion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.localFileProtection)
				.onChange(async (value) => {
					this.plugin.settings.localFileProtection = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Synch direction')
			.setDesc('Non existing files in destination will be deleted if not found in source')
			.addDropdown(dropdown => dropdown
        .addOption(SyncDirection.FROM_LOCAL.toString(), 'from local to remote')
        .addOption(SyncDirection.FROM_REMOTE.toString(), 'from remote to local')
				.setValue(this.plugin.settings.syncDirection.toString())
				.onChange(async (value) => {
          this.plugin.settings.syncDirection = parseInt(value)
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Enable status bar')
			.setDesc('Show the synchronization status application bottom bar')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableStatusBar)
				.onChange(async (value) => {
					this.plugin.settings.enableStatusBar = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Enable notifications')
			.setDesc('Show notifications whe synchronization status change')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNotifications)
				.onChange(async (value) => {
					this.plugin.settings.enableNotifications = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Enable automatic synchronization')
			.setDesc('Automatically synchronize changes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoSync)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoSync = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Automatic synchronization debounce')
			.setDesc('Delay the synchronization respect vault changes')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'0': 'disabled',
					'2': '2 seconds',
					'5': '5 seconds',
					'10': '10 seconds',
					'30': '30 seconds',
					'60': '1 minute',
					'300': '5 minutes',
				})
				.setValue(this.plugin.settings.autoSyncDebounce.toString())
				.onChange(async (value) => {
					this.plugin.settings.autoSyncDebounce = parseInt(value)
					await this.plugin.saveSettings()
				}))

    new Setting(containerEl)
			.setName('Enable automatic pull')
			.setDesc('Automatically pull changes from S3 bucket')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoPull)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoPull = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Automatic pull interval')
			.setDesc('Interval between S3 bucket changes checks')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'10': '10 seconds',
					'60': '1 minute',
					'300': '5 minutes',
					'600': '10 minutes',
					'1800': '30 minutes',
				})
				.setValue(this.plugin.settings.autoPullInterval.toString())
				.onChange(async (value) => {
					this.plugin.settings.autoPullInterval = parseInt(value)
					await this.plugin.saveSettings()
				}))

	}
}
const REGIONS = {
	'oss-cn-beijing': 'oss-cn-beijing'
	// 'us-east-1': 'US East (N. Virginia)',
	// 'us-west-1': 'US West (N. California)',
	// 'us-west-2': 'US West (Oregon)',
	// 'af-south-1': 'Africa (Cape Town)',
	// 'ap-east-1': 'Asia Pacific (Hong Kong)',
	// 'ap-south-1': 'Asia Pacific (Mumbai)',
	// 'ap-northeast-3': 'Asia Pacific (Osaka)',
	// 'ap-northeast-2': 'Asia Pacific (Seoul)',
	// 'ap-southeast-1': 'Asia Pacific (Singapore)',
	// 'ap-southeast-2': 'Asia Pacific (Sydney)',
	// 'ap-northeast-1': 'Asia Pacific (Tokyo)',
	// 'ca-central-1': 'Canada (Central)',
	// 'eu-central-1': 'Europe (Frankfurt)',
	// 'eu-west-1': 'Europe (Ireland)',
	// 'eu-west-2': 'Europe (London)',
	// 'eu-south-1': 'Europe (Milan)',
	// 'eu-west-3': 'Europe (Paris)',
	// 'eu-north-1': 'Europe (Stockholm)',
	// 'me-south-1': 'Middle East (Bahrain)',
	// 'sa-east-1': 'South America (S??o Paulo)'
  }