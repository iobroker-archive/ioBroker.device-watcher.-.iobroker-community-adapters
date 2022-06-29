/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';

const utils = require('@iobroker/adapter-core');
const adapterName = require('./package.json').name.split('.').pop();

class DeviceWatcher extends utils.Adapter {

	constructor(options) {
		super({
			...options,
			name: adapterName,
			useFormatDate: true,
		});

		this.on('ready', this.onReady.bind(this));
		//this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		// arrays
		this.offlineDevices 	= [],
		this.linkQualityDevices = [];
		this.batteryPowered 	= [];
		this.batteryLowPowered 	= [];
		this.listAllDevices 	= [];
		this.blacklistArr		= [];
		this.arrDev				= [];

		// counts
		this.offlineDevicesCount		= 0;
		this.deviceCounter				= 0;
		this.linkQualityCount			= 0;
		this.batteryPoweredCount 		= 0;
		this.lowBatteryPoweredCount		= 0;

		// arrays of supported adapters
		this.arrApart = {
			test: 		{'Selektor':'0_userdata.*.UNREACH', 'adapter':'Homematic', 'battery':'.OPERATING_VOLTAGE', 'reach':'.UNREACH'},
			test2: 		{'Selektor':'0_userdata.*.reachable', 'adapter':'Hue Extended', 'battery':'none', 'reach':'none', 'isLowBat':'none'},
			test3: 		{'Selektor':'0_userdata.*.link_quality', 'adapter':'Zigbee', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},

			ble: 			{'Selektor':'ble.*.rssi', 'adapter':'Ble', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			zigbee: 		{'Selektor':'zigbee.*.link_quality', 'adapter':'Zigbee', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			sonoff: 		{'Selektor':'sonoff.*.Wifi_RSSI', 'adapter':'Sonoff', 'battery':'.battery', 'reach':'none', 'isLowBat':'none'},
			shelly: 		{'Selektor':'shelly.*.rssi', 'adapter':'Shelly', 'battery':'.sensor.battery', 'reach':'none', 'isLowBat':'none'},
			homematic: 		{'Selektor':'hm-rpc.*.RSSI_DEVICE', 'adapter':'Homematic', 'battery':'.OPERATING_VOLTAGE', 'reach':'.UNREACH', 'isLowBat':'LOW_BAT'},
			deconz: 		{'Selektor':'deconz.*.reachable', 'adapter':'Deconz', 'battery':'.battery', 'reach':'.reachable', 'isLowBat':'none'},
			zwave: 			{'Selektor':'zwave2.*.ready', 'adapter':'Zwave', 'battery':'.Battery.level', 'reach':'.ready', 'isLowBat':'.Battery.isLow'},
			dect: 			{'Selektor':'fritzdect.*.present', 'adapter':'FritzDect', 'battery':'.battery', 'reach':'.present', 'isLowBat':'.batterylow'},
			hue: 			{'Selektor':'hue.*.reachable', 'adapter':'Hue', 'battery':'.battery', 'reach':'.reachable', 'isLowBat':'none'},
			hueExt: 		{'Selektor':'hue-extended.*.reachable', 'adapter':'Hue Extended', 'battery':'.config.battery', 'reach':'.reachable', 'isLowBat':'none'},
			ping: 			{'Selektor':'ping.*.alive', 'adapter':'Ping', 'battery':'none', 'reach':'.alive', 'isLowBat':'none'},
			switchbotBle: 	{'Selektor':'switchbot-ble.*.rssi', 'adapter':'Switchbot Ble', 'battery':'.battery', 'reach':'none', 'isLowBat':'none', 'id':'.id'},
			sonos: 			{'Selektor':'sonos.*.alive', 'adapter':'Sonos', 'battery':'none', 'reach':'.alive', 'isLowBat':'none'},
			mihome: 		{'Selektor':'mihome.*.state', 'adapter':'MiHome', 'battery':'.percent', 'reach':'none', 'isLowBat':'none'}
		};
	}

	async onReady() {
		this.log.debug(`Adapter ${adapterName} was started`);

		try {
			await this.main();
			await this.writeDatapoints();
			this.log.debug('all done, exiting');
			this.terminate ? this.terminate('Everything done. Going to terminate till next schedule', 11) : process.exit(0);
		} catch (e) {
			this.log.error(`Error while running Device-Watcher. Error Message: ${e}`);
			this.terminate ? this.terminate(15) : process.exit(15);
		}
	}

	//Helpfunctions
	async capitalize(sentence)
	{
		return sentence && sentence[0].toUpperCase() + sentence.slice(1);
	}

	async getInitValue(obj) {
		const foreignState = await this.getForeignStateAsync(obj);
		if (foreignState) return foreignState.val;
	}

	async getOwnInitValue(obj) {
		const stateVal = await this.getStateAsync(obj);
		if (stateVal) return stateVal.val;
	}

	async main() {
		this.log.debug(`Function started: ${this.main.name}`);

		const pushover = {
			instance: this.config.instancePushover,
			title: this.config.titlePushover,
			device: this.config.devicePushover

		};
		const telegram = {
			instance: this.config.instanceTelegram,
			user: this.config.deviceTelegram,
			chatId: this.config.chatIdTelegram
		};
		const email = {
			instance: this.config.instanceEmail,
			subject: this.config.subjectEmail,
			sendTo: this.config.sendToEmail

		};
		const jarvis = {
			instance: this.config.instanceJarvis,
			title: this.config.titleJarvis

		};
		const lovelace = {
			instance: this.config.instanceLovelace,
			title: this.config.titleLovelace

		};

		const choosedDays = {
			monday: this.config.checkMonday,
			tuesday: this.config.checkTuesday,
			wednesday: this.config.checkWednesday,
			thursday: this.config.checkThursday,
			friday: this.config.checkFriday,
			saturday: this.config.checkSaturday,
			sunday: this.config.checkSunday,
		};

		const sendPushover = async (text) => {
			await this.sendToAsync(pushover.instance, 'send', {
				message: text,
				title: pushover.title,
				device: pushover.device
			});
		};

		const sendTelegram = async (text) => {
			await this.sendToAsync(telegram.instance, 'send', {
				text: text,
				user: telegram.user,
				chatId: telegram.chatId
			});
		};

		const sendEmail = async (text) => {
			await this.sendToAsync(email.instance, 'send', {
				sendTo: email.sendTo,
				text: text,
				subject: email.subject
			});
		};

		const sendJarvis = async (text) => {
			await this.setForeignStateAsync(`${jarvis.instance}.addNotification`, text);
		};

		const sendLovelace = async (text) => {
			await this.setForeignStateAsync(`${lovelace.instance}.notifications.add`, text);
		};

		const supAdapter = {
			zigbee: 		this.config.zigbeeDevices,
			ble: 			this.config.bleDevices,
			sonoff: 		this.config.sonoffDevices,
			shelly: 		this.config.shellyDevices,
			homematic: 		this.config.homematicDevices,
			deconz:			this.config.deconzDevices,
			zwave: 			this.config.zwaveDevices,
			dect: 			this.config.dectDevices,
			hue: 			this.config.hueDevices,
			hueExt: 		this.config.hueExtDevices,
			nukiExt: 		this.config.nukiExtDevices,
			ping: 			this.config.pingDevices,
			switchbotBle: 	this.config.switchbotBleDevices,
			sonos: 			this.config.sonosDevices,
			mihome:			this.config.mihomeDevices,
			test: 			false, // Only for Developer
			test2: 			false, // Only for Developer
			test3:			false // Only for Developer
		};

		if (!supAdapter.zigbee &&
			!supAdapter.ble &&
			!supAdapter.sonoff &&
			!supAdapter.shelly &&
			!supAdapter.homematic &&
			!supAdapter.deconz &&
			!supAdapter.zwave &&
			!supAdapter.dect &&
			!supAdapter.hue &&
			!supAdapter.hueExt &&
			!supAdapter.nukiExt &&
			!supAdapter.ping &&
			!supAdapter.switchbotBle &&
			!supAdapter.sonos &&
			!supAdapter.mihome
		) {
			this.log.warn('No devices selected. Pleased check the instance configuration');
		}

		for(const [id] of Object.entries(this.arrApart)) {
			const idAdapter = supAdapter[id];
			if (idAdapter) {
				this.log.info(await this.capitalize(`${id} was selected. Loading data...`));
				this.arrDev.push(this.arrApart[id]);
			}
		}

		this.log.debug(JSON.stringify(this.arrDev));

		/*=============================================
		=            Start of main loop    		   	  =
		=============================================*/
		for (let i = 0; i < this.arrDev.length; i++) {
			const devices 			= await this.getForeignStatesAsync(this.arrDev[i].Selektor);
			const deviceAdapterName = this.arrDev[i].adapter;
			const myBlacklist 		= this.config.tableBlacklist;

			/*----------  Loop for blacklist ----------*/
			for(const i in myBlacklist){
				this.blacklistArr.push(myBlacklist[i].device);
				this.log.debug(`Found items on the blacklist: ${this.blacklistArr}`);
			}

			/*----------  Start of second main loop  ----------*/
			for(const [id] of Object.entries(devices)) {
				if (!this.blacklistArr.includes(id)) {

					const currDeviceString    	= id.slice(0, (id.lastIndexOf('.') + 1) - 1);
					const shortCurrDeviceString = currDeviceString.slice(0, (currDeviceString.lastIndexOf('.') + 1) - 1);

					//Get device name
					const deviceObject = await this.getForeignObjectAsync(currDeviceString);
					const shortDeviceObject = await this.getForeignObjectAsync(shortCurrDeviceString);
					let deviceName;

					if (deviceObject && typeof deviceObject === 'object') {
						deviceName = deviceObject.common.name;
					}

					if  (shortDeviceObject && typeof shortDeviceObject === 'object') {
						if (this.arrDev[i].adapter === 'Hue Extended') {
							deviceName = shortDeviceObject.common.name;
						}
					}

					//Get ID for Switchbot Devices
					if (this.arrDev[i].adapter === 'Switchbot Ble') {
						const switchbotID = await this.getForeignStateAsync(currDeviceString + this.arrDev[i].id);
						if (switchbotID) {
							deviceName = switchbotID.val;
						}
					}

					// 1. Get link quality
					const deviceQualityState = await this.getForeignStateAsync(id);
					let linkQuality;

					if ((deviceQualityState) && (typeof deviceQualityState.val === 'number')){
						if (this.config.trueState) {
							linkQuality = deviceQualityState.val;
						} else {
							if (deviceQualityState.val < 0) {
								linkQuality = Math.min(Math.max(2 * (deviceQualityState.val + 100), 0), 100) + '%';
							} else if ((deviceQualityState.val) >= 0) {
								linkQuality = parseFloat((100/255 * deviceQualityState.val).toFixed(0)) + '%';
							}
						}
						this.linkQualityDevices.push(
							{
								Device: deviceName,
								Adapter: deviceAdapterName,
								Link_quality: linkQuality
							}
						);
					} else {
					// no linkQuality available for powered devices
						linkQuality = ' - ';
					}

					// 1b. Count how many devices with link Quality
					this.linkQualityCount = this.linkQualityDevices.length;

					// 2. When was the last contact to the device?
					let lastContactString;

					if (deviceQualityState) {
						try {
							const time = new Date();
							const lastContact = Math.round((time.getTime() - deviceQualityState.ts) / 1000 / 60);
							const deviceUnreachState = await this.getInitValue(currDeviceString + this.arrDev[i].reach);

							// 2b. wenn seit X Minuten kein Kontakt mehr besteht, nimm Gerät in Liste auf
							//Rechne auf Tage um, wenn mehr als 48 Stunden seit letztem Kontakt vergangen sind
							//lastContactString = Math.round(lastContact) + ' Minuten';
							lastContactString = this.formatDate(new Date((deviceQualityState.ts)), 'hh:mm') + ' Uhr';
							if (Math.round(lastContact) > 100) {
								lastContactString = Math.round(lastContact/60) + ' Stunden';
							}
							if (Math.round(lastContact/60) > 48) {
								lastContactString = Math.round(lastContact/60/24) + ' Tagen';
							}
							if (this.arrDev[i].reach === 'none') {
								if (lastContact > this.config.maxMinutes) {
									this.offlineDevices.push(
										{
											Device: deviceName,
											Adapter: deviceAdapterName,
											Last_contact: lastContactString
										}
									);
								}
							} else {
								if ((deviceUnreachState) && (this.arrDev[i].adapter === 'Homematic')) {
									this.offlineDevices.push(
										{
											Device: deviceName,
											Adapter: deviceAdapterName,
											Last_contact: lastContactString
										}
									);
								} else if ((!deviceUnreachState) && (this.arrDev[i].adapter != 'Homematic')) {
									this.offlineDevices.push(
										{
											Device: deviceName,
											Adapter: deviceAdapterName,
											Last_contact: lastContactString
										}
									);
								}
							}
						} catch (e) {
							this.log.error(`(03) Error while getting timestate ${e}`);
						}
					}

					// 2c. Count how many devcies are offline
					this.offlineDevicesCount = this.offlineDevices.length;

					// 3. Get battery states
					const deviceBatteryState		= await this.getInitValue(currDeviceString + this.arrDev[i].battery);
					const shortDeviceBatteryState	= await this.getInitValue(shortCurrDeviceString + this.arrDev[i].battery);
					let batteryHealth;

					if ((!deviceBatteryState) && (!shortDeviceBatteryState)) {
						batteryHealth = ' - ';
					} else {
						this.log.debug(`Adapter ${this.arrDev[i].adapter}`);

						switch (this.arrDev[i].adapter) {
							case 'Homematic':
								if (deviceBatteryState === 0) {
									batteryHealth = ' - ';
								} else {
									batteryHealth = deviceBatteryState + 'V';
								}

								this.batteryPowered.push(
									{
										Device: deviceName,
										Adapter: deviceAdapterName,
										Battery: batteryHealth
									}
								);
								break;
							case 'Hue Extended':
								if (shortDeviceBatteryState) {
									batteryHealth = shortDeviceBatteryState + '%';
									this.batteryPowered.push(
										{
											Device: deviceName,
											Adapter: deviceAdapterName,
											Battery: batteryHealth
										}
									);
								}
								break;
							default:
								batteryHealth = (deviceBatteryState) + '%';
								this.batteryPowered.push(
									{
										Device: deviceName,
										Adapter: deviceAdapterName,
										Battery: batteryHealth
									}
								);
						}
					}

					// 3b. Count how many devices are with battery
					this.batteryPoweredCount = this.batteryPowered.length;

					// 3c. Count how many devices are with low battery
					const batteryWarningMin 		= this.config.minWarnBatterie;
					const deviceLowBatState			= await this.getInitValue(currDeviceString + this.arrDev[i].isLowBat);


					if (this.arrDev[i].isLowBat === 'none') {
						if (deviceBatteryState && (deviceBatteryState < batteryWarningMin)) {
							this.batteryLowPowered.push(
								{
									Device: deviceName,
									Adapter: deviceAdapterName,
									Battery: batteryHealth
								}
							);
						}
					} else {
						if (deviceLowBatState) {
							this.batteryLowPowered.push(
								{
									Device: deviceName,
									Adapter: deviceAdapterName,
									Battery: batteryHealth
								}
							);
						}
					}

					// 3d. Count how many devices are with low battery
					this.lowBatteryPoweredCount = this.batteryLowPowered.length;

					// 4. Add all devices in the list
					// only pusk if available
					if (this.config.listOnlyBattery) {
						if (deviceBatteryState !== null || shortDeviceBatteryState !== null) {
							this.listAllDevices.push(
								{
									Device: deviceName,
									Adapter: deviceAdapterName,
									Battery: batteryHealth,
									Last_contact: lastContactString,
									Link_quality: linkQuality
								}
							);
						}
					} else if (!this.config.listOnlyBattery) {
						this.listAllDevices.push(
							{
								Device: deviceName,
								Adapter: deviceAdapterName,
								Battery: batteryHealth,
								Last_contact: lastContactString,
								Link_quality: linkQuality
							}
						);
					}


					// 4a. Count how many devices are exists
					this.deviceCounter = this.listAllDevices.length;
				}
			} //<--End of second loop
		} //<---End of main loop


		/*=============================================
		=         	  	 Notifications 		          =
		=============================================*/

		/*----------  oflline notification ----------*/
		if(this.config.checkSendOfflineMsg) {
			try {
				let msg = '';
				const offlineDevicesCountOld = await this.getOwnInitValue('offlineCount');

				if ((this.offlineDevicesCount != offlineDevicesCountOld) && (this.offlineDevicesCount != 0)) {
					if (this.offlineDevicesCount == 1) {
						msg = 'Folgendes Gerät ist seit einiger Zeit nicht erreichbar: \n';
					} else if (this.offlineDevicesCount >= 2) {
						msg = 'Folgende ' + this.offlineDevicesCount + ' Geräte sind seit einiger Zeit nicht erreichbar: \n';
					}
					for (const id of this.offlineDevices) {
						msg = msg + '\n' + id['Device'] + ' ' + /*id['room'] +*/ ' (' + id['Last_contact'] + ')';
					}
					this.log.info(msg);
					await this.setStateAsync('lastNotification', msg, true);
					if (pushover.instance) {
						try {
							await sendPushover(msg);
						} catch (e) {
							this.log.warn (`Getting error at sending notification ${e}`);
						}
					}
					if (telegram.instance) {
						try {
							await sendTelegram(msg);
						} catch (e) {
							this.log.warn (`Getting error at sending notification ${e}`);
						}
					}
					if (email.instance) {
						try {
							await sendEmail(msg);
						} catch (e) {
							this.log.warn (`Getting error at sending notification ${e}`);
						}
					}
					if (jarvis.instance) {
						try {
							await sendJarvis('{"title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + this.offlineDevicesCount + ' Geräte sind nicht erreichbar","display": "drawer"}');
						} catch (e) {
							this.log.warn (`Getting error at sending notification ${e}`);
						}
					}
					if (lovelace.instance) {
						try {
							await sendLovelace('{"message":" ' + this.offlineDevicesCount + ' Geräte sind nicht erreichbar", "title":"'+ lovelace.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')"}');
						} catch (e) {
							this.log.warn (`Getting error at sending notification ${e}`);
						}
					}
				}
			} catch (e) {
				this.log.debug(`Getting error at sending offline notification ${e}`);
			}
		}

		/*----------  Low battery Notification ----------*/
		const now = new Date();
		const today = now.getDay();
		const checkDays = [];
		let checkToday;

		if (choosedDays.monday) checkDays.push(1);
		if (choosedDays.tuesday) checkDays.push(2);
		if (choosedDays.wednesday) checkDays.push(3);
		if (choosedDays.thursday) checkDays.push(4);
		if (choosedDays.friday) checkDays.push(5);
		if (choosedDays.saturday) checkDays.push(6);
		if (choosedDays.sunday) checkDays.push(0);

		if (this.config.checkSendBatteryMsg) this.log.debug(JSON.stringify(checkDays));

		checkDays.forEach(object => {
			if((object >= 0) && today == object){
				checkToday = true;
			}
		});

		if (this.config.checkSendBatteryMsg) {
			try {
				const lastBatteryNotifyIndicator = await this.getOwnInitValue('info.lastBatteryNotification');
				const batteryWarningMin = this.config.minWarnBatterie;

				if (now.getHours() < 11) {await this.setStateAsync('info.lastBatteryNotification', false, true);} //Nur einmal abfragen
				if ((now.getHours() > 11) && (!lastBatteryNotifyIndicator) && (checkToday != undefined)){
					let batteryMinCount = 0;
					let infotext = '';

					for (const id of this.batteryPowered) {
						if (id['Battery']) {
							const batteryValue = parseFloat(id['Battery'].replace('%', ''));
							if ((batteryValue < batteryWarningMin) && (id['Adapter'] != 'Homematic')) {
								infotext = infotext + '\n' + id['Device'] + ' ' + /*id['room'] +*/ ' (' + id['Battery'] + ')'.split(', ');
								++batteryMinCount;
							}
						}
					}
					if (batteryMinCount > 0) {
						this.log.info(`Batteriezustände: ${infotext}`);
						await this.setStateAsync('lastNotification', infotext, true);

						if (pushover.instance) {
							try {
								await sendPushover(`Batteriezustände: ${infotext}`);
							} catch (e) {
								this.log.warn (`Getting error at sending notification ${e}`);
							}
						}
						if (telegram.instance) {
							try {
								await sendTelegram(`Batteriezustände: ${infotext}`);
							} catch (e) {
								this.log.warn (`Getting error at sending notification ${e}`);
							}
						}
						if (email.instance) {
							try {
								await sendEmail(`Batteriezustände: ${infotext}`);
							} catch (e) {
								this.log.warn (`Getting error at sending notification ${e}`);
							}
						}
						if (jarvis.instance) {
							try {
								await sendJarvis('{"title":"'+ jarvis.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')","message":" ' + batteryMinCount + ' Geräte mit schwacher Batterie","display": "drawer"}');
							} catch (e) {
								this.log.warn (`Getting error at sending notification ${e}`);
							}
						}
						if (lovelace.instance) {
							try {
								await sendLovelace('{"message":" ' + batteryMinCount + ' Geräte mit schwacher Batterie", "title":"'+ lovelace.title +' (' + this.formatDate(new Date(), 'DD.MM.YYYY - hh:mm:ss') + ')"}');
							} catch (e) {
								this.log.warn (`Getting error at sending notification ${e}`);
							}
						}

						await this.setStateAsync('info.lastBatteryNotification', true, true);
					}
				}
			} catch (e) {
				this.log.debug(`Getting error at sending battery notification ${e}`);
			}
		}
		/*=====  End of Section notifications ======*/
		this.log.debug(`Function finished: ${this.main.name}`);
	}

	async writeDatapoints() {
		/*=============================================
		=            	Write Datapoints 		      =
		=============================================*/
		this.log.debug(`Start the function: ${this.writeDatapoints.name}`);

		try {
			await this.setStateAsync('offlineCount', {val: this.offlineDevicesCount, ack: true});
			await this.setStateAsync('countAll', {val: this.deviceCounter, ack: true});
			await this.setStateAsync('batteryCount', {val: this.batteryPoweredCount, ack: true});
			await this.setStateAsync('lowBatteryCount', {val: this.lowBatteryPoweredCount, ack: true});

			if (this.deviceCounter == 0) {
				this.listAllDevices       = [{Device: '--keine--', Adapter: '', Battery: '', Last_contact: '', Link_quality: ''}]; //JSON-Info Gesamtliste mit Info je Gerät

				await this.setStateAsync('listAll', {val: JSON.stringify(this.listAllDevices), ack: true});
			} else {
				await this.setStateAsync('listAll', {val: JSON.stringify(this.listAllDevices), ack: true});
			}

			if (this.linkQualityCount == 0) {
				this.linkQualityDevices	= [{Device: '--keine--', Adapter: '', Link_quality: ''}]; //JSON-Info alle mit LinkQuality

				await this.setStateAsync('linkQualityList', {val: JSON.stringify(this.linkQualityDevices), ack: true});
			} else {
				await this.setStateAsync('linkQualityList', {val: JSON.stringify(this.linkQualityDevices), ack: true});
			}


			if (this.offlineDevicesCount == 0) {
				this.offlineDevices	= [{Device: '--keine--', Adapter: '', Last_contact: ''}]; //JSON-Info alle offline-Geräte = 0

				await this.setStateAsync('offlineList', {val: JSON.stringify(this.offlineDevices), ack: true});
			} else {
				await this.setStateAsync('offlineList', {val: JSON.stringify(this.offlineDevices), ack: true});
			}

			if (this.batteryPoweredCount == 0) {
				this.batteryPowered	= [{Device: '--keine--', Adapter: '', Battery: ''}]; //JSON-Info alle batteriebetriebenen Geräte

				await this.setStateAsync('batteryList', {val: JSON.stringify(this.batteryPowered), ack: true});
			} else {
				await this.setStateAsync('batteryList', {val: JSON.stringify(this.batteryPowered), ack: true});
			}

			if (this.lowBatteryPoweredCount == 0) {
				this.batteryLowPowered	= [{Device: '--keine--', Adapter: '', Battery: ''}]; //JSON-Info alle batteriebetriebenen Geräte

				await this.setStateAsync('lowBatteryList', {val: JSON.stringify(this.batteryLowPowered), ack: true});
			} else {
				await this.setStateAsync('lowBatteryList', {val: JSON.stringify(this.batteryLowPowered), ack: true});
			}

			//Zeitstempel wann die Datenpunkte zuletzt gecheckt wurden
			const lastCheck = this.formatDate(new Date(), 'DD.MM.YYYY') + ' - ' + this.formatDate(new Date(), 'hh:mm:ss');
			await this.setStateAsync('lastCheck', lastCheck, true);
		}
		catch (e) {
			this.log.error(`(05) Error while writing the states ${e}`);
		}
		/*=====  End of writing Datapoints ======*/
		this.log.debug(`Function finished: ${this.writeDatapoints.name}`);
	}

	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new DeviceWatcher(options);
} else {
	// otherwise start the instance directly
	new DeviceWatcher();
}
