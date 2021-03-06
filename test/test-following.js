import chai, { expect } from 'chai';

import { OrderedSet, List } from 'immutable';



export function prepareFollow(env, done) {
	env.timeout(30 * 1000)
	env.user
		.follow(env.otherUser.address)
		.then(() => done())
		.catch(error => done(error))
}



export function shouldFollow() {

	it("can follow other users", function() {
		this.retries(2)
		var testFollowing = this.user
			.isFollowing(this.otherUser.address)
		return expect(testFollowing).to.eventually.be.true
	})


	it("can be followed by other users", function() {
		this.retries(2)
		var testFollower = this.otherUser
			.isFollowedBy(this.user.address)
		return expect(testFollower).to.eventually.be.true
	})

}


export function shouldFollowWithoutRoot() {

	it("can see which users they follow", function() {
		var followers = this.otherUser.followerIndex()
		return expect(followers).to.eventually
			.be.an.instanceOf(OrderedSet)
			.and.have.size(1)
			.and.include(this.user.address)
	})


	it("can see which users follow them", function() {
		var following = this.user.followingIndex()
		return expect(following).to.eventually
			.be.an.instanceOf(OrderedSet)
			.and.have.size(1)
			.and.include(this.otherUser.address)
	})

}


export function shouldFollowWithRoot() {

	it("automatically follow the root account", function(done) {
		var testRoot = this.user
			.isFollowing(this.podium.rootAddress)
		var testOtherRoot = this.otherUser
			.isFollowing(this.podium.rootAddress)
		Promise.all([testRoot, testOtherRoot])
			.then(([result, otherResult]) => {
				expect(result).to.be.true
				expect(otherResult).to.be.true
				done()
			})
			.catch(error => done(error))
	})


	it("can see which users they follow", function() {
		var followers = this.otherUser.followerIndex()
		return expect(followers).to.eventually
			.be.an.instanceOf(OrderedSet)
			.and.have.size(1)
			.and.include(this.user.address)
	})


	it("can see which users follow them", function() {
		var following = this.user.followingIndex()
		return expect(following).to.eventually
			.be.an.instanceOf(OrderedSet)
			.and.have.size(2)
			.and.include(this.otherUser.address)
	})

}



export function shouldCreateFollowAlerts() {

	it("sends new followed alert", function(done) {
		this.otherUser
			.alerts(false, 100, true)
			.then(alerts => {

				expect(alerts).to
					.be.instanceOf(List)

				const followAlerts = alerts
					.filter(a => a.get("type") === "follow")
					.toList()
				expect(followAlerts).to
					.have.size(1)

				expect(followAlerts.first()).to
					.have.property("type", "follow")
				expect(followAlerts.first()).to
					.have.property("from", this.user.address)
				expect(followAlerts.first()).to
					.and.have.property("to", this.otherUser.address)

				done()

			})
			.catch(error => done(error))
	})

}



export function shouldCacheFollowData() {

	it("caches index of followers", function(done) {
		this.timeout(10)
		this.otherUser
			.followerIndex(false)
			.then(followers => {
				expect(followers).to
					.be.an.instanceOf(OrderedSet)
					.and.have.size(1)
					.and.include(this.user.address)
				done()
			})
			.catch(error => done(error))
	})

	it("caches index of followed users", function(done) {
		this.timeout(10)
		this.user
			.followingIndex(false)
			.then(followed => {
				expect(followed).to
					.be.an.instanceOf(OrderedSet)
					.and.have.size(2)
					.and.include(this.otherUser.address)
				done()
			})
			.catch(error => done(error))
	})

}



