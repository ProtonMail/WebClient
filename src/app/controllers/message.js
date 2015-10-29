angular.module("proton.controllers.Message", ["proton.constants"])

.controller("MessageController", function(
    $compile,
    $filter,
    $interval,
    $log,
    $q,
    $rootScope,
    $sce,
    $scope,
    $state,
    $stateParams,
    $templateCache,
    $timeout,
    $translate,
    alertModal,
    attachments,
    authentication,
    cacheMessages,
    confirmModal,
    CONSTANTS,
    Label,
    Message,
    networkActivityTracker,
    notify,
    pmcw,
    tools
) {
    $scope.mailbox = $state.current.name.replace('secured.', '').replace('.list', '').replace('.view', '');
    $scope.tools = tools;
    $scope.isPlain = false;
    $scope.labels = authentication.user.Labels;
    $scope.CONSTANTS = CONSTANTS;
    $scope.attachmentsStorage = [];

    $scope.$on('updateReplied', function(e, m) {
        _.extend($scope.message, m);
    });

    $scope.$on('refreshMessage', function() {
        cacheMessages.get($scope.message.ID).then(function(result) {
            _.extend($scope.message, result);
        });
    });

    $scope.$on('$destroy', function() {
        // cancel timer ago
        $interval.cancel($scope.agoTimer);
    });

    $scope.initView = function() {
        var last = _.last($scope.messages);

        if(last.IsRead === 0) {
            last.IsRead = 1;
            Message.read({IDs: [last.ID]});
            // TODO generate event
        }

        if($scope.message === last) {
            if(angular.isDefined($scope.message.Body)) {
                $scope.displayContent();
            } else {
                cacheMessages.getMessage($scope.message.ID).then(function(message) {
                    _.extend($scope.message, message);
                    console.log($scope.message);
                    $scope.displayContent();
                });
            }
        }

        // // start timer ago
        // $scope.agoTimer = $interval(function() {
        //     _.each($scope.messages, function(message) {
        //         var time = $filter('longReadableTime')($scope.message.Time);
        //
        //     });
        //     $scope.ago = time;
        // }, 1000);
    };

    $scope.toggleStar = function(message) {
        var ids = [];
        var promise;
        var newMessage = angular.copy(message);

        ids.push(message.ID);

        if(message.Starred === 1) {
            promise = Message.unstar({IDs: ids}).$promise;
            newMessage.Starred = 0;
        } else {
            promise = Message.star({IDs: ids}).$promise;
            newMessage.Starred = 1;
        }

        networkActivityTracker.track(promise);
        cacheMessages.events([{Action: 3, ID: newMessage.ID, Message: newMessage}]);
    };

    $scope.openSafariWarning = function() {
        alertModal.activate({
            params: {
                title: $translate.instant('DOWNLOAD_CONTACTS'),
                alert: 'alert-warning',
                message: 'Safari does not fully support downloading contacts.<br /><br />Please login with a different browser to download contacts.', // TODO translate
                ok: function() {
                    alertModal.deactivate();
                }
            }
        });
    };

    $scope.displayContent = function(print) {
        var whitelist = ['notify@protonmail.com'];

        if (whitelist.indexOf($scope.message.Sender.Address) !== -1 && $scope.message.IsEncrypted === 0) {
            $scope.message.imagesHidden = false;
        } else if(authentication.user.ShowImages === 1) {
            $scope.message.imagesHidden = false;
        }

        $scope.message.clearTextBody().then(function(result) {
            var showMessage = function(content) {
                if(print !== true) {
                    content = $scope.message.clearImageBody(content);
                }

                // safari warning
                if(!$rootScope.isFileSaverSupported) {
                    $scope.safariWarning = true;
                }

                content = DOMPurify.sanitize(content, {
                    ADD_ATTR: ['target'],
                    FORBID_TAGS: ['style', 'input', 'form']
                });

                // for the welcome email, we need to change the path to the welcome image lock
                content = content.replace("/img/app/welcome_lock.gif", "/assets/img/emails/welcome_lock.gif");

                if (tools.isHtml(content)) {
                    $scope.isPlain = false;
                } else {
                    $scope.isPlain = true;
                }

                $scope.content = $sce.trustAsHtml(content);
                $timeout(function() {
                    tools.transformLinks('message-body');
                }, 0, false);

                // broken images
                $("img").error(function () {
                    $(this).unbind("error").addClass("pm_broken");
                });

                if(print) {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                }
            };

            // PGP/MIME
            if ( $scope.message.IsEncrypted === 8 ) {

                var mailparser = new MailParser({
                    defaultCharset: 'UTF-8'
                });

                mailparser.on('end', function(mail) {
                    var content;

                    if (mail.html) {
                        content = mail.html;
                    } else if (mail.text) {
                        content = mail.text;
                    } else {
                        content = "Empty Message";
                    }

                    if (mail.attachments) {
                        content = "<div class='alert alert-danger'><span class='pull-left fa fa-exclamation-triangle'></span><strong>PGP/MIME Attachments Not Supported</strong><br>This message contains attachments which currently are not supported by ProtonMail.</div><br>"+content;
                    }

                    $scope.$evalAsync(function() { showMessage(content); });
                });

                mailparser.write(result);
                mailparser.end();
            } else {
                $scope.$evalAsync(function() { showMessage(result); });
            }
        }, function(err) {
            $scope.togglePlainHtml();
            //TODO error reporter?
            $log.error(err);
        });
    };

    $scope.markAsRead = function() {
        var promise;
        var newMessage = angular.copy(message);

        newMessage.IsRead = 1;
        promise = Message.read({IDs: [message.ID]}).$promise;
        networkActivityTracker.track(promise);
        cacheMessages.events([{Action: 3, ID: newMessage.ID, Message: newMessage}]);
    };

    $scope.markAsUnread = function() {
        var promise;
        var newMessage = angular.copy(message);

        newMessage.IsRead = 0;
        promise = Message.unread({IDs: [message.ID]}).$promise;
        networkActivityTracker.track(promise);
        cacheMessages.events([{Action: 3, ID: newMessage.ID, Message: newMessage}]);
        $scope.goToMessageList();
    };

    $scope.toggleImages = function(message) {
        message.toggleImages();
        $scope.displayContent(message);
    };

    $scope.decryptAttachment = function(attachment, $event) {
        $event.preventDefault();

        var link = angular.element($event.target);
        var href = link.attr('href');

        if(href !== undefined && href.search(/^data.*/)!==-1) {
            alert("Your browser lacks features needed to download encrypted attachments directly. Please right-click on the attachment and select Save/Download As.");
            return false;
        }

        // get enc attachment
        var att = attachments.get(attachment.ID, attachment.Name);

        attachment.decrypting = true;

        if (attachment.KeyPackets === undefined) {
            return att.then( function(result) {
                $scope.downloadAttachment(attachment);
                attachment.decrypting = false;
                attachment.decrypted = true;
                $scope.$apply();
            });
        } else {
            var attachmentStored = _.findWhere($scope.attachmentsStorage, {ID: attachment.ID});

            if(angular.isDefined(attachmentStored)) {
                $scope.downloadAttachment({
                    data: attachmentStored.data,
                    Name: attachmentStored.name,
                    MIMEType: attachment.MIMEType,
                    el: $event.target,
                });
                attachment.decrypting = false;
                $scope.$apply();
            } else {
                // decode key packets
                var keyPackets = pmcw.binaryStringToArray(pmcw.decode_base64(attachment.KeyPackets));
                // get user's pk
                var key = authentication.getPrivateKey().then(
                    function(pk) {
                        // decrypt session key from keypackets
                        return pmcw.decryptSessionKey(keyPackets, pk);
                    }
                );

                // when we have the session key and attachment:
                $q.all({
                    "attObject": att,
                    "key": key
                 }).then(
                    function(obj) {
                        // create new Uint8Array to store decryted attachment
                        var at = new Uint8Array(obj.attObject.data);

                        // grab the key
                        var key = obj.key.key;

                        // grab the algo
                        var algo = obj.key.algo;

                        // decrypt the att
                        pmcw.decryptMessage(at, key, true, algo)
                        .then(
                            function(decryptedAtt) {
                                // Store attachment decrypted
                                $scope.attachmentsStorage.push({
                                    ID: attachment.ID,
                                    data: decryptedAtt.data,
                                    name: decryptedAtt.filename
                                });
                                // Call download function
                                $scope.downloadAttachment({
                                    data: decryptedAtt.data,
                                    Name: decryptedAtt.filename,
                                    MIMEType: attachment.MIMEType,
                                    el: $event.target,
                                });
                                attachment.decrypting = false;
                                attachment.decrypted = true;
                                if(!$rootScope.isFileSaverSupported) {
                                    $($event.currentTarget)
                                    .prepend('<span class="fa fa-download"></span>');
                                }
                                $scope.$apply();
                            },
                            function(err) {
                                $log.error(err);
                            }
                        );
                    },
                    function(err) {
                        attachment.decrypting = false;
                        confirmModal.activate({
                            params: {
                                title: 'Unable to decrypt attachment.',
                                message: '<p>We were not able to decrypt this attachment. The technical error code is:</p><p> <pre>'+err+'</pre></p><p>Email us and we can try to help you with this. <kbd>support@protonmail.com</kbd></p>',
                                confirm: function() {
                                    confirmModal.deactivate();
                                },
                                cancel: function() {
                                    confirmModal.deactivate();
                                }
                            }
                        });
                    }
                );
            }
        }
    };

    $scope.downloadAttachment = function(attachment) {
        try {
            var blob = new Blob([attachment.data], {type: attachment.MIMEType});
            var link = $(attachment.el);

            if($rootScope.isFileSaverSupported) {
                saveAs(blob, attachment.Name);
            } else {
                // Bad blob support, make a data URI, don't click it
                var reader = new FileReader();

                reader.onloadend = function () {
                    link.attr('href',reader.result);
                };

                reader.readAsDataURL(blob);
            }
        } catch (error) {
            console.log(error);
        }
    };

    $scope.detachLabel = function(id) {
        var promise = Label.remove({id: id, MessageIDs: [message.ID]}).$promise;
        var newMessage = angular.copy(message);

        newMessage.LabelIDs = _.without(message.LabelIDs, id);
        cacheMessages.events([{Action: 3, ID: newMessage.ID, Message: newMessage}]);
        networkActivityTracker.track(promise);
    };

    $scope.getLabel = function(id) {
        return _.where($scope.labels, {ID: id})[0];
    };

    $scope.getColorLabel = function(label) {
        return {
            borderColor: label.Color,
            color: label.Color
        };
    };

    $scope.saveLabels = function(labels, alsoArchive) {
        var deferred = $q.defer();
        var messageIDs = [message.ID];
        var newMessage = angular.copy(message);
        var toApply = _.map(_.where(labels, {Selected: true}), function(label) { return label.ID; });
        var toRemove = _.map(_.where(labels, {Selected: false}), function(label) { return label.ID; });
        var promises = [];

        // Detect if the current message will have too many labels
        if(_.difference(_.uniq(angular.copy(message.LabelIDs).concat(toApply)), toRemove).length > 5) {
            notify($translate.instant('TOO_MANY_LABELS_ON_MESSAGE'));
            deferred.reject();
        } else {
            _.each(toApply, function(labelID) {
                promises.push(Label.apply({id: labelID, MessageIDs: messageIDs}).$promise);
            });

            _.each(toRemove, function(labelID) {
                promises.push(Label.remove({id: labelID, MessageIDs: messageIDs}).$promise);
            });

            $q.all(promises).then(function() {
                newMessage.LabelIDs = _.difference(_.uniq(newMessage.LabelIDs.concat(toApply)), toRemove);
                cacheMessages.events([{Action: 3, ID: newMessage.ID, Message: newMessage}]);

                if(alsoArchive === true) {
                    deferred.resolve($scope.moveMessageTo('archive'));
                } else {
                    if(toApply.length > 1 || toRemove.length > 1) {
                        notify($translate.instant('LABELS_APPLIED'));
                    } else {
                        notify($translate.instant('LABEL_APPLIED'));
                    }

                    deferred.resolve();
                }
            });

            networkActivityTracker.track(deferred.promise);
        }

        return deferred.promise;
    };

    $scope.sendMessageTo = function(email) {
        var message = new Message();

        _.defaults(message, {
            ToList: [email], // contains { Address, Name }
            CCList: [],
            BCCList: [],
            Attachments: [],
            Subject: '',
            PasswordHint: ''
        });

        $rootScope.$broadcast('loadMessage', message);
    };

    // Return Message object to build response or forward
    function buildMessage(action) {
        var base = new Message();
        var br = '<br />';
        var contentSignature = DOMPurify.sanitize('<div>' + tools.replaceLineBreaks($scope.user.Signature) + '</div>');
        var signature = ($(contentSignature).text().length === 0)? '<br /><br />' : '<br /><br />' + contentSignature + '<br /><br />';
        var blockquoteStart = '<blockquote class="protonmail_quote">';
        var originalMessage = '-------- Original Message --------<br />';
        var subject = 'Subject: ' + message.Subject + '<br />';
        var time = 'Local Time: ' + $filter('localReadableTime')(message.Time) + '<br />UTC Time: ' + $filter('utcReadableTime')(message.Time) + '<br />';
        var from = 'From: ' + message.Sender.Address + '<br />';
        var to = 'To: ' + tools.contactsToString(message.ToList) + '<br />';
        var cc = (message.CCList.length > 0)?('CC: ' + tools.contactsToString(message.CCList) + '<br />'):('');
        var blockquoteEnd = '</blockquote>';
        var re_prefix = $translate.instant('RE:');
        var fw_prefix = $translate.instant('FW:');
        var re_length = re_prefix.length;
        var fw_length = fw_prefix.length;

        base.ParentID = message.ID;
        base.Body = signature + blockquoteStart + originalMessage + subject + time + from + to + cc + br + $scope.content + blockquoteEnd;

        if(angular.isDefined(message.AddressID)) {
            base.From = _.findWhere(authentication.user.Addresses, {ID: message.AddressID});
        }

        if (action === 'reply') {
            base.Action = 0;
            base.Subject = (message.Subject.toLowerCase().substring(0, re_length) === re_prefix.toLowerCase()) ? message.Subject : re_prefix + ' ' + message.Subject;

            if($state.is('secured.sent.message')) {
                base.ToList = message.ToList;
            } else {
                base.ToList = [message.ReplyTo];
            }
        } else if (action === 'replyall') {
            base.Action = 1;
            base.Subject = (message.Subject.toLowerCase().substring(0, re_length) === re_prefix.toLowerCase()) ? message.Subject : re_prefix + ' ' + message.Subject;

            if(_.where(authentication.user.Addresses, {Email: message.Sender.Address}).length > 0) {
                base.ToList = message.ToList;
                base.CCList = message.CCList;
                base.BCCList = message.BCCList;
            } else {
                base.ToList = [message.ReplyTo];
                base.CCList = _.union(message.ToList, message.CCList);
                // Remove user address in CCList and ToList
                _.each(authentication.user.Addresses, function(address) {
                    base.ToList = _.filter(base.ToList, function(contact) { return contact.Address !== address.Email; });
                    base.CCList = _.filter(base.CCList, function(contact) { return contact.Address !== address.Email; });
                });
            }
        } else if (action === 'forward') {
            base.Action = 2;
            base.ToList = [];
            base.Subject = (message.Subject.toLowerCase().substring(0, fw_length) === fw_prefix.toLowerCase()) ? message.Subject : fw_prefix + ' ' + message.Subject;
        }

        return base;
    }

    $scope.reply = function() {
        $rootScope.$broadcast('loadMessage', buildMessage('reply'));
    };

    $scope.replyAll = function() {
        $rootScope.$broadcast('loadMessage', buildMessage('replyall'));
    };

    $scope.forward = function() {
        $rootScope.$broadcast('loadMessage', buildMessage('forward'), true);
    };

    $scope.goToMessageList = function() {
        var mailbox = $state.current.name.replace('secured.', '').replace('.list', '').replace('.view', '');

        $state.go("secured." + mailbox + '.list', {
            id: null // remove ID
        });
    };

    $scope.moveMessageTo = function(mailbox) {
        var promise;
        var inDelete = mailbox === 'delete';
        var events = [];
        var action;
        var newMessage = angular.copy(message);

        newMessage.Location = CONSTANTS.MAILBOX_IDENTIFIERS[mailbox];

        if(inDelete) {
            promise = Message.delete({IDs: [message.ID]}).$promise;
            action = 0;
        } else {
            action = 3;
            promise = Message[mailbox]({IDs: [message.ID]}).$promise;
        }

        promise.then(function(result) {
            messages.push({Action: action, ID: newMessage.ID, Message: newMessage});
            cacheMessages.events(events);
            $scope.goToMessageList();
        });

        networkActivityTracker.track(promise);
    };

    $scope.print = function() {
        var url = $state.href('secured.print', { id: message.ID });

        window.open(url, '_blank');
    };

    $scope.viewPgp = function() {
        var content = message.Header + '\n\r' + message.Body;
        var filename = 'pgp.txt';

        if(navigator.msSaveBlob) { // IE 10+
            content = content.replace(/\n/g, "\r\n");
            var blob = new Blob([content], { type: 'data:text/plain;base64;' });
            navigator.msSaveBlob(blob, filename);
        } else {
            window.open('data:text/plain;base64,' + btoa(content), '_blank');
        }
    };

    $scope.togglePlainHtml = function() {
        if (message.viewMode === 'plain') {
            message.viewMode = 'html';
        } else {
            message.viewMode = 'plain';
        }
    };

    $scope.initView();
});
