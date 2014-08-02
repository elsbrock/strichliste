var seq = require('seq');

var errors = require('../errors');
var Result = require('../Result');
var MountPoint = require('../routing/MountPoint');

var config = require('../../configuration/default.js');
var Decimal = require('decimal.js');
Decimal.config({ precision: 5, rounding: Decimal.ROUND_HALF_UP });

function TransactionCreate (userLoader, mqttWrapper) {
    this._userLoader = userLoader;
    this._mqttWrapper = mqttWrapper;
}

TransactionCreate.prototype.mountPoint = function () {
    return new MountPoint('post', '/user/:userId/transaction', ['user']);
};

TransactionCreate.prototype.route = function (req, res, next) {
    var that = this;

    var userId = req.params.userId;

    try {
        var value = new Decimal(req.body.value);
    } catch(e) {
        return next(new errors.InvalidRequestError('not a number: ' + req.body.value));
    }

    if (value.isZero()) {
        return next(new errors.InvalidRequestError('value must not be zero'));
    }

    if (!req.strichliste.result) {
        return next(new errors.InternalServerError('previous stage result missing'));
    }

    seq()
        .seq(function () {
            that._userLoader.createTransaction(userId, value.toFixed(2), this);
        })
        .seq(function (transactionId) {
            that._userLoader.loadTransaction(transactionId, function (error, result) {
                if (error)
                    return next(new errors.InternalServerError('error retrieving transaction: ' + transactionId));

                that._mqttWrapper.publishTransactionValue(value.toFixed(2));

                result.value = new Decimal(result.value).toFixed(2);
                req.strichliste.result = new Result(result, Result.CONTENT_TYPE_JSON, 201);
                next();
            });
        })
        .catch(function (error) {
            next(new errors.InternalServerError('unexpected: ' + error.message));
        });
};

module.exports = TransactionCreate;
