import { Map, List, fromJS } from 'immutable';

import FormData from 'form-data';
// import fetch from 'node-fetch';

import { radixUniverse, RadixUniverse, RadixLogger,
		 RadixAccount, RadixUtil, RadixKeyPair,
		 RadixSimpleIdentity, RadixIdentityManager,
		 RadixKeyStore, RadixTransactionBuilder } from 'radixdlt-reactnative';

import { PodiumError } from './podiumError';
import { PodiumPaths } from './podiumPaths';

import { PodiumUser, PodiumServerUser, PodiumClientUser } from './podiumUser';
import { PodiumPost, PodiumClientPost } from './podiumPost';

import { getAccount } from './utils';






export class Podium {



// INITIALIZATION

	constructor() {

		// Set up global variables
		this.path = new PodiumPaths()
		this.channels = Map({})
		this.timers = Map({})
		this.debug = false

	}


	connect(config={}) {
		//NOTE: This is a promise because the overriding
		//		methods in PodiumServer and PodiumClient
		//		need to return promises and this keeps
		//		handling consistent between the interfaces.
		return new Promise((resolve, reject) => {

			// Set logging level
			this.setDebug(config.DebugMode || false);

			// Extract settings from config
			this.config = fromJS(config)

			// Set application ID
			if (config.RadixApplicationID) {
				this.app = config.RadixApplicationID
			} else {
				const seed = Math.floor(1000000 * Math.random())
				this.app = `${config.RadixApplicationPrefix}AUTO|${seed}`
			}

			// Set timings
			this.launched = (new Date).getTime()
			this.timeout = config.RadixTimeout || 10000;
			this.lifetime = config.RadixConnectionLifetime || 60000;

			// Set root user, if provided
			this.rootAddress = config.RootAddress;
			
			// Connect to S3
			this.media = config.MediaStore || "media.podium-network.com/";
			this.S3 = new s3({
				apiVersion: '2006-03-01',
				region: 'eu-west-1',
				accessKeyId: process.env.AWS_ACCESS_KEY,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
			})

			// Connect to radix network
			//TODO - Test radix connection
			switch (config.RadixUniverse) {
				case ("sunstone"):
					radixUniverse.bootstrap(RadixUniverse.SUNSTONE);
					break;
				case ("highgarden"):
					radixUniverse.bootstrap(RadixUniverse.HIGHGARDEN);
					break;
				case ("alphanet"):
					radixUniverse.bootstrap(RadixUniverse.ALPHANET);
					break;
				default: // Default to the alpha net
					radixUniverse.bootstrap(RadixUniverse.ALPHANET2);
			}

			// Return the connected API
			resolve(this)

		})
	}


	becomeClient(config) {
		return (new PodiumClient()).connect(config || this.config.toJS())
	}

	becomeServer(config) {
		return (new PodiumServer()).connect(config || this.config.toJS())
	}




// UTILITIES

	getAccount(seed) {
		return getAccount(seed);
	}

	cleanUp() { 
		this.cleanUpTimers();
		this.cleanUpChannels();
	}

	setDebug(debug) {
		this.debug = debug;
		if (!debug) {
			RadixLogger.setLevel('silent')
		} else {
			console.log("Debug Mode On")
		}
	}

	debugOut() {
		if (this.debug) {
			console.log(this.constructor.name, " > ", ...arguments)
		}
	}




// TIMERS

	newTimer(
			id,			// Identifier of timer
			duration,	// Duration of timer
			callback	// Function to be called upon timer completion
		) {

		// Start timer
		const timer = setTimeout(() => {

			// Run callback
			callback()

			// Delete record of this timer
			this.timers = this.timers.delete(id);

		}, duration);

		// Store timer
		this.timers = this.timers.set("id", fromJS({
			timer: timer,
			callback: callback,
			duration: duration
		}))

	}


	resetTimer(
			id 		// Identifier of timer to be restarted
		) {

		// Retrieve timer
		const timer = this.timers.get("id")

		// Stop timer
		clearTimeout(timer.get("timer"))

		// Recreate timer
		this.newTimer(id, timer.get("duration"), timer.get("callback"))

	}

	stopTimer(
			id 		// Identifier of timer to be stopped
		) {

		// Stop timer
		clearTimeout(this.timers.getIn(["id", "timer"]))

		// Delete record of this timer
		this.timers = this.timers.delete("id")

	}

	cleanUpTimers() {

		// Stops all timers
		this.timers.map((_, k) => this.stopTimer(k))

	}






// WRITE DATA TO RADIX

	storeRecord(
			identity,	// Identity object of the storing user [RadixIdentity]
			accounts,	// Destination accounts for record [Array]
			payload		// Payload of record to be sent [Object{}]
		) {
		return new Promise((resolve, reject) => {
			if (accounts.length === 0) {
				reject(new Error("Received empty accounts array"));
			} else {
				this.debugOut(`Writing to ${accounts.length} ledger paths: ${payload}`)
				RadixTransactionBuilder
					.createPayloadAtom(
						accounts,
						this.app,
						JSON.stringify(payload),
						false
					)
					.signAndSubmit(identity)
					.subscribe({
						complete: () => resolve(true),
						next: status => this.debugOut(" > ", status),
						error: error => reject(error)
					});
			}
		});
	}


	storeRecords() {
		this.debugOut(`Storing multiple records...`)
		return new Promise((resolve, reject) => {

			// Unpack arg list
			var args = Array.prototype.slice.call(arguments)

			// Get identity
			const identity = args[0]

			// Break out accounts and records
			var inputs = List(args.slice(1, args.length))

			// Build promises
			var storing = inputs
				.groupBy((_, i) => Math.floor(i / 2.0))
				.map(([accounts, payload]) =>
					this.storeRecord(identity, accounts, payload)
				)

			// Wait for promises to complete
			Promise.all(storing)
				.then(() => resolve())
				.catch(error => reject(error))

		})
	}


	storeMedia(image, imageURL) {
		this.debugOut(`Storing media on S3`)
		return new Promise((resolve, reject) => {
			this.S3
				.putObject({
					Bucket: this.media,
					Key: imageURL,
					Body: Buffer.from(image, "base64"),
					ContentType: `image/${imageURL.split(".")[1]}`
				})
				.promise()
				.then(() => resolve())
				.catch(error => reject(error))
		})
	}




// FETCH DATA FROM RADIX

	getHistory(
			account,				// Account to retreive all records from
			timeout = this.timeout 	// Assume history is empty after X seconds inactivity
		) {

		// Pulls all current values from a radix
		// -account- and closes the channel connection.
		let expire;
		this.debugOut(`Fetching Account History (timeout: ${timeout}s)`)
		return new Promise((resolve, reject) => {

			// Create variables
			let channel;
			let skipper;
			var history = List()

			// Set up query timeout
			let received;
			const timeoutError = new PodiumError().withCode(2);
			let radixTimeout = () => {
				channel.unsubscribe()
				if (received) {
					this.debugOut("Timed out. Resolving with current history.")
					resolve(history.sort((a, b) =>
						(a.get("created") > b.get("created")) ? 1 : -1
					))
				} else {
					this.debugOut("Timed out. No history received.")
					reject(timeoutError)
				}
			}

			// Generate timeout, if required
			let expire;
			if (timeout && timeout > 0) {
				expire = setTimeout(radixTimeout, timeout * 1000)
			}

			// Open the account connection and delay timeout
			// in event of node connection failure
			account.openNodeConnection()
				.catch(error => {
					clearTimeout(expire)
					if (timeout && timeout > 0) {
						expire = setTimeout(radixTimeout, timeout * 1000)
					}
				})

			// Connect to account data
			const stream = account.dataSystem
				.getApplicationData(this.app);

			// Fetch all data from target channel
			channel = stream.subscribe({
				//TODO - Rewrite to pull until up-to-date once
				//		 radix provides the required flag.
				//		 Currently, this just collates all
				//		 input until timeout.
				next: item => {

					// Log debug
					this.debugOut(`Received Item: ${item.data.payload}`)

					// Cancel shortcut timer
					if (skipper) { clearTimeout(skipper) }

					// Unpack record
					var record = Map(fromJS(JSON.parse(item.data.payload)))
						.set("received", (new Date()).getTime())
						.set("created", item.data.timestamp)

					// Add record to history (except for placeholders)
					if (!record.get("placeholder")) {
						history = history.push(record)
					}
					received = true;

					// Assume all records collated 1 second after first
					// (This won't work long-term, but serves as an
					// efficient fix for the timeout issue until the
					// radix lib can flag a channel as up to date).
					skipper = setTimeout(() => {
						this.debugOut("No record received for 1s. Resolving early.")
						channel.unsubscribe()
						clearTimeout(expire)
						resolve(history.sort((a, b) =>
							(a.get("created") > b.get("created")) ? 1 : -1
						))
					}, 1000);

				},
				error: error => {
					console.error(error)
					clearTimeout(expire)
					channel.unsubscribe();
					reject(error)
				}
			});

		});

		// TODO - Close node connection

	}


	getLatest(
			account,				// Account to query latest record from
			timeout = this.timeout 	// Assume account is empty after X seconds inactivity
		) {

		// Returns the most recent payload among all
		// data for the provided -account-.

		// Get account history
		return new Promise((resolve, reject) => {
			this.getHistory(account, timeout)
				.then(history => resolve(history
					.sort((a, b) => (a.get("created") > b.get("created")) ? 1 : -1)
					.last()
				))
				.catch(error => reject(error));
		});

	}




// SUBSCRIBE TO RADIX DATA

	openChannel(
			account,					// Radix account to be queried
			callback,					// Function to be called for each new record on channel
			onError = null,				// Function to be called in case of error
			lifetime = this.lifetime	// Close channel after X seconds of inactivity
		) {

		// Creates and manages a subscription to new data
		// updates for a given -account-, running
		// -callback- whenever a new item is received.
		// Will run -onError- callback in case of error.
		// Will timeout after -lifetime- ms of inactivity,
		// or will remain open indefinitely if -lifetime-
		// is not provided or set to 0.

		//TODO - Close channels after a period of inactivity
		//		 and reopen automatically on resume.

		// Check channel to this account is not already open
		const address = account.getAddress()
		if (this.channels.has(address)) {
			return this.channels.getIn(address)
		}

		// Connect to the account
		account.openNodeConnection()

		// Initialize data request
		const stream = account.dataSystem.applicationDataSubject;

		// Set up timeout, if required
		let timer;
		if (lifetime > 0) {
			timer = this.newTimer(address, lifetime,
				() => this.closeChannel(address))
		}

		// Subscribe to data stream
		const channel = stream.subscribe({
			next: async item => {

				// Reset timeout
				if (lifetime > 0) { this.resetTimer(address) }

				// Unpack data
				const result = Map(fromJS(JSON.parse(item.data.payload)))
					.set("received", (new Date()).getTime())
					.set("created", item.data.timestamp)
				this.debugOut(`Received Item on Channel: ${result.toJS()}`)

				// Run callback (ignoring placeholder records)
				if (!result.get("placeholder")) {
					callback(result)
				}

			},
			error: error => {

				// Run callback
				if (typeof(onError) === "function") {
					onError(error)
				} else {
					this.closeChannel(address)
					throw error
				}

			}
		})

		// Log open channel
		this.channels = this.channels.set("address", channel)

		// Return the channel
		return channel

	}

	closeChannel(
			address 	// Radix address of channel to be closed
		) {

		// Closes and cleans up a channel created by
		// openChannel

		// Stop channel timeout
		if (this.channels.has(address)) {
			this.stopTimer(address)
			this.channels.get(address).unsubscribe()
			this.channels = this.channels.delete(address)
		}

		//TODO - Close radix node connection

	}

	cleanUpChannels() {

		// Closes all open Channels
		this.channels.map((_, c) => this.closeChannel(c))

	}





// CREATE USERS

	createUser(
			id,			// Podium @ ID of new user account
			pw,			// Password for new user account
			name,		// Display name of new user account
			bio,		// Bio of new user account
			picture,
			ext
		) {

		// Registers a new podium user.

		// Podium users are represented on the ledger by 6 records
		//	1) Profile Record - stores information about the user,
		//			including their display name and bio
		//	2) POD Record - stores transactions of Podium Tokens
		//			by the user, which can be compiled to calculate
		//			the user's current POD balance
		//	3) AUD Record - stores transactions of Audium Tokens
		//			by the user, which can be compiled to calculate
		//			the user's current AUD balance
		//	4) Integrity Record - stores gains/losses of Integrity
		//			for this user, which can be compiled to calculate
		//			the user's current Integrity
		//	5) Permissions - stores records dictating the user's
		//			current permissions on Podium
		//	6) ID Ownership Record - stores a reference for the user's
		//			address to their Podium @ ID. Used to confirm
		//			account ownership, track account history, and to
		//			permit users to freely transfer their IDs

		//TODO - Require ID and pw to obey certain rulesets

		//TODO - Replace with scrypto smart contract

		// Create output promise
		return new Promise(async (resolve, reject) => {

			//TODO - Ensure user does not already exist
			this.isUser(id)
				.then(address => {
					if (address) {
						reject((new PodiumError).withCode(3))
					} else {
				
						// Create user identity
						const identityManager = new RadixIdentityManager();
						const identity = identityManager.generateSimpleIdentity();
						const address = identity.account.getAddress();

						// Generate user public record
						const profileAccount = this.path.forProfileOf(address)
						const profilePayload = {
							record: "profile",
							type: "profile",
							id: id,
							name: name,
							bio: bio || "",
							picture: "",
							address: address
						}

						// Generate user POD account
						const podAccount = this.path.forPODTransactionsOf(address)
						const podPayload = {
							record: "transaction",
							type: "POD",
							to: address,
							value: 1000,
							from: "creation"
						}

						// Generate user integrity record
						const integrityAccount = this.path.forIntegrityOf(address)
						const integrityPayload = {
							owner: address,
							i: 0.5,
							from: ""
						}

						// Generate record of this user's address owning this ID
						const ownershipAccount = this.path.forProfileWithID(id)
						const ownershipPayload = {
							record: "ownership",
							type: "username",
							id: id,
							owner: address
						}

						// Add placeholder record to following, post, and follower
						// accounts to speed loading
						const placeholderAccounts = [
							this.path.forPostsBy(address),
							this.path.forUsersFollowing(address),
							this.path.forUsersFollowedBy(address)
						]
						const placeholderPayload = {
							placeholder: true
						}

						// Encrypt keypair
						const keyStore = this.path.forKeystoreOf(id, pw);
						RadixKeyStore.encryptKey(identity.keyPair, pw)
							.then(async encryptedKey => {

								// Store registration records
								return this.storeRecords(
									identity,
									[keyStore], encryptedKey,
									[profileAccount], profilePayload,
									[podAccount], podPayload,
									[integrityAccount], integrityPayload,
									[ownershipAccount], ownershipPayload,
									placeholderAccounts, placeholderPayload
								)

							})
							//TODO - Auto-follow Podium master account
							.then(() => this.user(address).signIn(id, pw))
							.then(activeUser => {

								// Set user's profile picture
								let picturePromise;
								if (picture) {
									picturePromise = activeUser
										.updateProfilePicture(picture, ext)
										.then(() => resolve(activeUser))
										.catch(error => reject(error))
								} else {
									resolve(activeUser)
								}

							})
							.catch(error => reject(error))

					}
				})
				.catch(error => reject(error))

		});

	}


	user(address) {
		const newUser = new PodiumUser(this, address)
		return newUser
	}


	activeUser(id, pw) {
		return new Promise((resolve, reject) => {
			new PodiumUser(this)
				.signIn(id, pw)
				.then(activeUser => resolve(activeUser))
				.catch(error => reject(error))
		})
	}


	isUser(id) {
		return new Promise((resolve, reject) => {
			this.getLatest(this.path.forProfileWithID(id))
				.then(ownershipRecord =>
					resolve(ownershipRecord.get("owner"))
				)
				.catch(error => {
					if (error.code === 2) {
						resolve(false)
					} else {
						reject(error)
					}
				})
		})
	}




// TOKENS

	mint(value, identity) {
		return new Promise((resolve, reject) => {

			// Create mint payload and fetch reserve account
			const reserveAccount = this.path
				.forPODTransactionsOf(identity.account.getAddress())
			const mintPayload = {
				record: "transaction",
				type: "POD",
				value: value,
				from: "mint"
			}

			// Dispatch payload
			this.storeRecord(identity, [reserveAccount], mintPayload)
				.then(resolve)
				.catch(reject)

		})
	}





// POSTS

	post(address) {
		const newPost = new PodiumPost(this, address)
		return newPost
	}



}




export class PodiumClient extends Podium {



	connect(config={}) {
		return new Promise((resolve, reject) => {

			// Store server address
			this.serverURL = config.ServerURL || "https://api.podium-network.com"

			// Check server connection
			fetch(this.serverURL)
				.then(response => {

					// Throw an error if server not found
					if (!response.ok) {
						reject((new PodiumError()).withCode(0))
					} else {

						// Initialize class locally, if required
						if (config.LocalConfig) {
							Podium.prototype.connect.call(this, config)
							resolve(this)

						// Otherwise, load config from the server
						} else {
							fetch(`${this.serverURL}/config`)
								.then(response => response.json())
								.then(serverConfig => {
									Podium.prototype.connect.call(this, serverConfig)
									this.publicKey = serverConfig.publicKey
									resolve(this)
								})
								.catch(error => reject(error))
						}

					}

				})
				.catch(reject)

		})
	}



// SEND RECORDS

	// Prevent remote clients from writing directly
	// to the ledger, except via smart contract

	storeRecord() {
		throw (new PodiumError).withCode(101)
	}

	storeRecords() {
		throw (new PodiumError).withCode(101)
	}

	storeMedia() {
		throw (new PodiumError).withCode(101)
	}



// SERVER INTERFACE

	dispatch(route, data, identity) {
		this.debugOut(`Posting to ${this.serverURL}${route}:`, data)
		return new Promise(async (resolve, reject) => {

			var body = new FormData()

			// Add credentials to body, if required
			if (identity) {
				const encryptedKeyPair = await RadixKeyStore
					.encryptKey(identity.keyPair, this.publicKey)
					.catch(error => reject(error))
				// const encryptedKeyPair = crypto.publicEncrypt(
				// 	{
				// 		key: this.publicKey,
				// 		padding: constants.RSA_NO_PADDING
				// 	},
				// 	new Buffer.from(JSON.stringify(wrappedKeyPair))
				// )
				body.append("keyPair", JSON.stringify(encryptedKeyPair))
			}

			// Build request body
			Object.keys(data).forEach(k => {
				if (data[k]) { body.append(k, String(data[k])) }
			})

			// Post data
			fetch(`${this.serverURL}${route}`, {
					method: "POST",
					body: body
				})

				// Check response for errors
				.then(async response => {
					if (response.ok) {
						return response.json()
					} else {
						await response.json()
							.then(error => {
								let err;
								if (error.podiumError) {
									err = (new PodiumError())
										.withCode(error.code)
								} else {
									err = new Error("Request failed: " +
													error.error)
								}
								reject(err)
							})
							.catch(error => reject(error))
					}
				})

				// Return response data
				.then(result => {
					this.debugOut(" > Response: ", result)
					resolve(fromJS(result))
				})

				// Handle errors
				.catch(error => reject(error))

		})
	}




// USERS

	createUser(
		id,			// Podium @ ID of new user account
		pw,			// Password for new user account
		name,		// Display name of new user account
		bio,		// Bio of new user account
		picture,	// Picture, as base64 string
		ext
		) {
		return new Promise((resolve, reject) => {
			this.dispatch("/user", {
					id: id,
					pw: pw,
					name: name,
					bio: bio,
					picture: picture,
					ext: ext
				})
				.then(response => {
					return this.user(response.get("address"))
						.signIn(id, pw)
				})
				.then(activeUser => resolve(activeUser))
				.catch(error => reject(error))
		})
	}


	user(address) {
		const newUser = new PodiumClientUser(this, address)
		return newUser
	}


	activeUser(id, pw) {
		return new Promise((resolve, reject) => {
			new PodiumClientUser(this)
				.signIn(id, pw)
				.then(resolve)
				.catch(reject)
		})
	}


	isUser(id) {
		return new Promise((resolve, reject) => {
			this.dispatch("/isuser", { id: id })
				.then(response => resolve(response.get("result")))
				.then(activeUser => resolve(activeUser))
				.catch(error => reject(error))
		})
	}


	post(address) {
		const newPost = new PodiumClientPost(this, address)
		return newPost
	}




// SEARCH

	search(target) {
		return new Promise((resolve, reject) => {
			this.dispatch("/search", { target: target })
				.then(results => resolve(results.toList()))
				.catch(error => reject(error))
		})
	}



}





