"use strict";
/**
 * Core data types for the privacy-first account discovery application.
 * All data structures are designed to avoid storing sensitive information.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSource = void 0;
var DataSource;
(function (DataSource) {
    DataSource["GMAIL_OAUTH"] = "Gmail (OAuth)";
    DataSource["GMAIL_TAKEOUT"] = "Gmail (Takeout)";
    DataSource["CHROME_CSV"] = "Chrome (CSV)";
    DataSource["APPLE_EXPORT"] = "Apple (Export)";
    DataSource["MICROSOFT_OAUTH"] = "Microsoft (OAuth)";
    DataSource["FACEBOOK_OAUTH"] = "Facebook (OAuth)";
    DataSource["TWITTER_OAUTH"] = "Twitter/X (OAuth)";
})(DataSource || (exports.DataSource = DataSource = {}));
