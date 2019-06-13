import { RadixAccount } from 'radixdlt-reactnative';

import { getAccount } from './utils';




export class PodiumPaths {


	faucet() {
		return RadixAccount.fromAddress(
			'9he94tVfQGAVr4xoUpG3uJfB2exURExzFV6E7dq4bxUWRbM5Edd', true);
	}


	// Governance
	forLaw(id) {
		return getAccount("podium-governance-law-" + id.toLowerCase())
	}
	forLawAdvice(id) {
		return getAccount("podium-governance-law-advice-" + id.toLowerCase())
	}
	forLawArticle(id) {
		return getAccount("podium-governance-law-article-" + id.toLowerCase())
	}
	forLawTest(id) {
		return getAccount("podium-governance-law-test-" + id.toLowerCase())
	}
	forLawConsideration(id) {
		return getAccount("podium-governance-law-consideration-" + id.toLowerCase())
	}
	forRight(id) {
		return getAccount("podium-governance-right-" + id.toLowerCase())
	}
	forRightLevel(id) {
		return getAccount("podium-governance-right-level-" + id.toLowerCase())
	}
	forSanction(id) {
		return getAccount("podium-governance-sanction-" + id.toLowerCase())
	}


	// Users
	forProfileOf(address) {
		return RadixAccount.fromAddress(address)
	}
	forKeystoreOf(id, pw) {
		return getAccount("podium-keystore-for-" + id.toLowerCase() + pw)
	}
	forProfileWithID(id) {
		return getAccount("podium-ownership-of-id-" + id.toLowerCase())
	}
	forIntegrityOf(address) {
		return getAccount("podium-integrity-score-of-" + address);
	}

	// Tokens
	forPODTransactionsOf(address) {
		return getAccount("podium-token-transactions-of-" + address);
	}
	forAUDTransactionsOf(address) {
		return getAccount("audium-token-transactions-of-" + address);
	}

	// Topics
	forTopic(address) {
		return RadixAccount.fromAddress(address)
	}
	forTopicWithID(id) {
		return getAccount("podium-topic-with-id-" + id.toLowerCase());
	}
	forPostsAboutTopic(address) {
		return getAccount("podium-posts-about-topic-" + address)
	}
	

	// Posts
	forPostsBy(address) {
		return getAccount("podium-posts-by-user-" + address)
	}
	forPost(address) {
		return RadixAccount.fromAddress(address)
	}
	forNextPostBy(user) {
		// TODO - Fix this so posts are stored deterministicly again
		return getAccount("podium-post-by-" + user.get("address") +
			              "-" + (user.get("posts") + user.get("pending")));
	}
	forNewPost(post) {
		return getAccount(`podium-post-with-content-${post}${Math.random()}`);
	}
	forRepliesToPost(address) {
		return getAccount("podium-replies-to-post-" + address)
	}
	forPromotionsOfPost(address) {
		return getAccount("podium-promotions-of-post-" + address)
	}
	forReportsOfPost(address) {
		return getAccount("podium-reports-of-post-" + address)
	}
	

	// Media
	forMedia(file) {
		return getAccount(JSON.stringify(file))
	}
	forMediaFrom(address) {
		return getAccount("podium-media-uploaded-by-" + address)
	}


	// Follows
	forUsersFollowing(address) {
		return getAccount("podium-user-followers-" + address)
	}
	forUsersFollowedBy(address) {
		return getAccount("podium-user-following-" + address)
	}
	

	// Alerts
	forAlertsTo(address) {
		return getAccount("podium-user-alerts-" + address)
	}

}


