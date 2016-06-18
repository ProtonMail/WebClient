angular.module("proton.controllers.Conversations", ["proton.constants"])

.controller('ConversationsController', function(
    $q,
    $log,
    $rootScope,
    $scope,
    $state,
    $stateParams,
    $timeout,
    gettextCatalog,
    $filter,
    $window,
    $cookies,
    action,
    CONSTANTS,
    Conversation,
    Message,
    eventManager,
    Label,
    authentication,
    cache,
    confirmModal,
    Setting,
    cacheCounters,
    networkActivityTracker,
    notify,
    tools
) {
    var lastChecked = null;
    var unbindWatcherElements;
    var firstLoad = true; // Variable used to determine if it's the first load to force the cache to call back-end result

    /**
     * Method called at the initialization of this controller
     */
    $scope.initialization = function() {
        // Variables
        $scope.markedConversation = null;
        $scope.mailbox = tools.currentMailbox();
        $scope.conversationsPerPage = authentication.user.NumMessagePerPage;
        $scope.labels = authentication.user.Labels;
        $scope.messageButtons = authentication.user.MessageButtons;
        $scope.Math = window.Math;
        $scope.elementPerPage = CONSTANTS.ELEMENTS_PER_PAGE;
        $scope.selectedFilter = $stateParams.filter;
        $scope.selectedOrder = $stateParams.sort || "-date";
        $scope.page = parseInt($stateParams.page || 1);
        $scope.startWatchingEvent();
        $scope.refreshConversations().then(function() {
            $timeout($scope.actionsDelayed); // If we don't use the timeout, messages seems not available (to unselect for example)
            // I consider this trick like a bug in the angular application
        }, function(error) {
            $log.error(error);
        });
        $scope.setTimeWidths();

    };

    $scope.setTimeWidths = function() {

        // Dec 28, 2888 - longest possible width
        var time = '29000668525';

        // initalize to zero
        var width = 0;

         // convert timestamp to readabile, LOCALIZED time format
        time = $filter('readableTime')(time);

        // append to DOM:
        $('body').append('<div id="timeWidthTest" style="position:absolute;left:0;top:0;z-index:1;visibility:hidden">');
        $('#timeWidthTest').text(time);

        // get the width
        width = $('#timeWidthTest').outerWidth();

        // add 10% for safety
        width = width * 1;

        // round up to a whole integer
        width = Math.ceil(width);

        // if width isnt zero, we're probably good
        if (width > 0) {

            // lets set some CSS to update our time elements
            var style = "<style>.conversation .row .meta em.time { width: "+ width +"px !important; } .conversation .row .meta { width: "+ (width+40) +"px !important;} .conversation .row h4 { width: calc(100% - "+ (width+75) +"px) !important; }</style>";

            // inject CSS into DOM
            $('body').append(style);

        }

        $('#timeWidthTest').remove();

    };

    $scope.watchElements = function() {
        if(angular.isDefined(unbindWatcherElements)) {
            unbindWatcherElements();
        }

        unbindWatcherElements = $scope.$watch('conversations', function(newValue, oldValue) {
            $rootScope.numberElement = newValue.length;
            $rootScope.numberElementSelected = $scope.elementsSelected().length;
            $rootScope.numberElementChecked = $scope.elementsChecked().length;
            $rootScope.numberElementUnread = cacheCounters.unreadConversation(tools.currentLocation());
        }, true);
    };

    $scope.senders = function(element) {
        if (angular.isDefined(element.Senders)) {
            return element.Senders;
        } else {
            return [element.Sender];
        }
    };

    $scope.recipients = function(element) {
        if (angular.isDefined(element.Recipients)) {
            return element.Recipients;
        } else {
            var recipients = [];

            if (element.ToList) {
                recipients = recipients.concat(element.ToList);
            }

            if (element.CCList) {
                recipients = recipients.concat(element.CCList);
            }

            if (element.BCCList) {
                recipients = recipients.concat(element.BCCList);
            }

            return recipients;
        }
    };

    /**
     * Return if we can display the placeholder or not
     * @param {Boolean}
     */
    $scope.placeholder = function() {
        return $rootScope.layoutMode === 'columns' && ($scope.idDefined() === false || ($scope.idDefined() === true && $rootScope.numberElementChecked > 0));
    };

    $scope.startWatchingEvent = function() {
        $scope.$on('refreshConversations', function() {
            $scope.refreshConversations();
        });

        $scope.$on('openMarked', function(event) {
            if (angular.element('.message.marked').length === 0) {
                $scope.click($scope.markedConversation);
            }
        });

        $scope.$on('selectMark', function(event) {
            $scope.markedConversation.Selected = !!!$scope.markedConversation.Selected;
            $scope.$apply();
        });

        $scope.$on('selectAllElements', function(event) {
            $scope.selectAllElements();
            $scope.$apply();
        });

        $scope.$on('unselectAllElements', function(event) {
            $scope.unselectAllElements();
            $scope.$apply();
        });

        $scope.$on('applyLabels', function(event, LabelID) {
            $scope.applyLabels(LabelID);
        });

        $scope.$on('move', function(event, name) {
            if (angular.element('.message.marked').length === 0) {
                $scope.move(name);
            }
        });

        $scope.$on('read', function(event) {
            if (angular.element('.message.marked').length === 0) {
                $scope.read();
            }
        });

        $scope.$on('unread', function(event) {
            if (angular.element('.message.marked').length === 0) {
                $scope.unread();
            }
        });

        $scope.$on('markPrevious', function(event) {
            if (angular.element('.message.marked').length === 0) {
                var index = $scope.conversations.indexOf($scope.markedConversation);

                if (index > 0) {
                    $scope.markedConversation = $scope.conversations[index - 1];
                    $scope.$apply();
                    angular.element('#conversation-list-rows').scrollTop(angular.element('.conversation.marked')[0].offsetTop - angular.element('#conversation-list-rows').height() / 2);
                    angular.element('#conversation-list-columns').scrollTop(angular.element('.conversation.marked')[0].offsetTop - angular.element('#conversation-list-columns').height() / 2);
                }
            }
        });

        $scope.$on('markNext', function(event) {
            if (angular.element('.message.marked').length === 0) {
                var index = $scope.conversations.indexOf($scope.markedConversation);

                if (index < ($scope.conversations.length - 1)) {
                    $scope.markedConversation = $scope.conversations[index + 1];
                    $scope.$apply();
                    angular.element('#conversation-list-rows').scrollTop(angular.element('.conversation.marked')[0].offsetTop - angular.element('#conversation-list-rows').height() / 2);
                    angular.element('#conversation-list-columns').scrollTop(angular.element('.conversation.marked')[0].offsetTop - angular.element('#conversation-list-columns').height() / 2);
                }
            }
        });

        $scope.$on('nextConversation', function(event) {
            $scope.nextConversation();
        });

        $scope.$on('previousConversation', function(event) {
            $scope.previousConversation();
        });

        $scope.$on('$destroy', $scope.stopWatchingEvent);
    };

    $scope.stopWatchingEvent = function() {
        angular.element($window).unbind('resize', $rootScope.mobileResponsive);
        angular.element($window).unbind('orientationchange', $rootScope.mobileResponsive);
    };

    $scope.actionsDelayed = function() {
        $scope.unselectAllElements();
        $('#page').val($scope.page);
        $('#page').change(function(event) {
            $scope.goToPage();
        });

        if ($rootScope.scrollPosition) {
            $('#content').scrollTop($rootScope.scrollPosition);
            $rootScope.scrollPosition = null;
        }
    };

    $scope.selectPage = function(page) {
        $scope.goToPage(page, page < $scope.page);
    };

    $scope.conversationCount = function() {
        var result;

        if(angular.isDefined($stateParams.filter) || $scope.mailbox === 'search') {
            result = $rootScope.Total;
        } else {
            switch($scope.mailbox) {
                case 'drafts':
                    result = cacheCounters.totalMessage(CONSTANTS.MAILBOX_IDENTIFIERS[$scope.mailbox]);
                    break;
                case 'label':
                    result = cacheCounters.totalConversation($stateParams.label);
                    break;
                default:
                    result = cacheCounters.totalConversation(CONSTANTS.MAILBOX_IDENTIFIERS[$scope.mailbox]);
                    break;
            }
        }

        return result;
    };

    $scope.makeDropdownPages = function() {
        var ddp = [];
        var ddp2 = [];
        var makeRangeCounter = 0;
        var count = $scope.conversationCount();

        for (var i = 0; i <= parseInt(count - 1); i++) {
            ddp[i] = i;
        }

        function makeRange(element, index, array) {
            if(index%CONSTANTS.ELEMENTS_PER_PAGE === 0) {
                ddp2.push((index+1) + ' - ' + (index+CONSTANTS.ELEMENTS_PER_PAGE));
                makeRangeCounter++;
            }
        }

        ddp.forEach(makeRange);

        return ddp2;
    };

    $scope.getConversationsParameters = function(mailbox) {
        var params = {};

        params.Page = ($stateParams.page || 1) - 1;

        if (angular.isDefined($stateParams.filter)) {
            params.Unread = +($stateParams.filter === 'unread'); // Convert Boolean to Integer
        }

        if (angular.isDefined($stateParams.sort)) {
            var sort = $stateParams.sort;
            var desc = sort.charAt(0) === '-';

            if (desc === true) {
                sort = sort.slice(1);
            }

            params.Sort = $filter('capitalize')(sort);
            params.Desc = +desc;
        }

        if (mailbox === 'search') {
            params.Address = $stateParams.address;
            params.Label = $stateParams.label;
            params.Keyword = $stateParams.keyword;
            params.To = $stateParams.to;
            params.From = $stateParams.from;
            params.Subject = $stateParams.subject;
            params.Begin = $stateParams.begin;
            params.End = $stateParams.end;
            params.Attachments = $stateParams.attachments;
        } else if(mailbox === 'label') {
            params.Label = $stateParams.label;
        } else {
            params.Label = CONSTANTS.MAILBOX_IDENTIFIERS[mailbox];
        }

        _.pick(params, _.identity);

        return params;
    };

    $scope.refreshConversations = function() {
        var deferred = $q.defer();
        var request = $scope.getConversationsParameters($scope.mailbox);
        var context = tools.cacheContext();
        var type = tools.typeList();
        var promise;

        if(type === 'message') {
            promise = cache.queryMessages(request, firstLoad);
        } else if(type === 'conversation') {
            promise = cache.queryConversations(request, firstLoad);
        }

        promise.then(function(elements) {
            var page = $stateParams.page || 0;

            $scope.conversations = elements;
            $scope.watchElements();
            firstLoad = false;

            if ($scope.conversations.length === 0 && page > 0) {
                $scope.back();
            }

            if ($scope.conversations.length > 0 && ($scope.markedConversation === null || $scope.conversations.indexOf($scope.markedConversation) === -1)) {
                var element;

                if ($stateParams.id) {
                    element = _.findWhere($scope.conversations, {ID: $stateParams.id});
                } else {
                    element = $scope.conversations[0];
                }

                $scope.markedConversation = element;
            }

            deferred.resolve(elements);
        }, function(error) {
            notify({message: gettextCatalog.getString('Error during quering conversations', null, 'Error'), classes: 'notification-danger'});
            $log.error(error);
        });

        if(context === false) {
            networkActivityTracker.track(promise);
        }

        return deferred.promise;
    };

    /**
     * Return if the current element is active
     * @param {Object} element
     * @return {Boolean}
     */
    $scope.active = function(element) {
        if($rootScope.numberElementChecked === 0 && angular.isDefined($state.params.id)) {
            return $state.params.id === element.ConversationID || $state.params.id === element.ID;
        } else {
            return false;
        }
    };

    /**
     * Manage time displaying
     * @param {Object} conversation or message
     * @return {Integer}
     */
    $scope.time = function(element) {
        var type = tools.typeList();
        var time;

        if(type === 'conversation') {
            var loc = tools.currentLocation();

            time = cache.getTime(element.ID, loc);
        } else if(type === 'message') {
            time = element.Time;
        }

        return time;
    };

    $scope.size = function(element) {
        if (angular.isDefined(element.TotalSize)) {
            return element.TotalSize;
        } else if (angular.isDefined(element.Size)) {
            return element.Size;
        }
    };

    /**
     * Return style to color tag label
     * @param {String} id - label id
     * @return {Object} style
     */
    $scope.getColorLabel = function(id) {
        return {
            color: $scope.getLabel(id).Color,
            borderColor: $scope.getLabel(id).Color
        };
    };

    /**
     *
     * @return {}
     */
    $scope.start = function() {
        return ($scope.page - 1) * $scope.conversationsPerPage + 1;
    };

    /**
     *
     * @return {} end
     */
    $scope.end = function() {
        var end = $scope.start() + $scope.conversationsPerPage - 1;

        if (end > $scope.conversationCount()) {
            end = $scope.conversationCount();
        }

        return end;
    };

    /**
     * Return if all elements are selected
     * @return {Boolean}
     */
    $scope.allSelected = function() {
        if(angular.isDefined($scope.conversations)) {
            var numberElement = $scope.conversations.length;
            var numberElementChecked = _.where($scope.conversations, {Selected: true}).length;

            if (numberElement > 0) {
                return numberElement === numberElementChecked;
            } else {
                return false;
            }
        } else {
            return false;
        }
    };

    /**
     * Select or unselect all elements
     */
    $scope.toggleAllSelected = function() {
        var status = $scope.allSelected();

        if(status === true) {
            $scope.unselectAllElements();
        } else {
            $scope.selectAllElements();
        }
    };

    /**
     * Select all elements
     */
    $scope.selectAllElements = function() {
        _.each($scope.conversations, function(element) {
            element.Selected = true;
        });
    };

    /**
     * Unselect all elements
     */
    $scope.unselectAllElements = function() {
        _.each($scope.conversations, function(element) {
            element.Selected = false;
        });
    };

    /**
     * Return [Element] selected
     * @return {Array} elements
     */
    $scope.elementsSelected = function() {
        var elements = $scope.elementsChecked();

        if ($scope.conversations.length > 0 && elements.length === 0) {
            var type = tools.typeList();

            if (type === 'message') {
                elements = _.where($scope.conversations, {ID: $scope.markedConversation.ID});
            } else if (type === 'conversation') {
                elements = _.where($scope.conversations, {ID: $scope.markedConversation.ID});
            }
        }

        return elements;
    };

    $scope.elementsChecked = function() {
        return _.where($scope.conversations, {Selected: true});
    };

    /**
     * Return [IDs]
     * @return {Array}
     */
    $scope.idsSelected = function() {
        return _.map($scope.elementsSelected(), function(conversation) { return conversation.ID; });
    };

    /**
     * Go to the next conversation
     */
    $scope.nextConversation = function() {
        var current = $state.$current.name;
        var id = $state.params.id;

        cache.more(id, 'next').then(function(id) {
            $state.go(current, {id: id});
        });
    };

    /**
     * Go to the previous conversation
     */
    $scope.previousConversation = function() {
        var current = $state.$current.name;
        var id = $state.params.id;

        cache.more(id, 'previous').then(function(id) {
            $state.go(current, {id: id});
        });
    };

    /**
     * Mark conversations selected as read
     */
    $scope.read = function() {
        var type = tools.typeList();
        var ids = $scope.idsSelected();

        if(type === 'conversation') {
            action.readConversation(ids);
        } else if(type === 'message') {
            action.readMessage(ids);
        }
    };

    /**
     * Mark conversations selected as unread
     */
    $scope.unread = function() {
        var type = tools.typeList();
        var ids = $scope.idsSelected();

        if(type === 'conversation') {
            action.unreadConversation(ids);
        } else if(type === 'message') {
            action.unreadMessage(ids);
        }

        if(angular.isDefined($state.params.id)) {
            $scope.back();
        }
    };

    /**
     * Delete elements selected
     */
    $scope.delete = function() {
        var type = tools.typeList();
        var ids = $scope.idsSelected();

        if(type === 'conversation') {
            action.deleteConversation(ids);
        } else if(type === 'message') {
            action.deleteMessage(ids);
        }
    };

    /**
     * Move conversation to an other location
     * @param {String} mailbox
     */
    $scope.move = function(mailbox) {
        var type = tools.typeList();
        var ids = $scope.idsSelected();

        if(type === 'conversation') {
            action.moveConversation(ids, mailbox);
        } else if(type === 'message') {
            action.moveMessage(ids, mailbox);
        }
    };

    /**
     * Complex method to apply labels on element selected
     * @param {Array} labels
     * @param {Boolean} alsoArchive
     * @return {Promise}
     */
    $scope.saveLabels = function(labels, alsoArchive) {
        var type = tools.typeList();
        var ids = $scope.idsSelected();

        if(type === 'conversation') {
            action.labelConversation(ids, labels, alsoArchive);
        } else if(type === 'message') {
            var messages = $scope.elementsSelected();

            action.labelMessage(messages, labels, alsoArchive);
        }
    };

    /**
     * Back to conversation / message list
     */
    $scope.back = function() {
        $state.go("secured." + $scope.mailbox, {
            id: null // remove ID
        });
    };

    // Let users change the col/row modes.
    $scope.changeLayout = function(mode) {
        var newLayout;

        if (mode === 'rows' && $rootScope.layoutMode!=='rows') {
            newLayout = 1;
        } else if (mode === 'columns' && $rootScope.layoutMode!=='columns') {
            newLayout = 0;
        } else if (mode === 'mobile') {
            $rootScope.mobileMode = true;
        }

        if (
            (mode === 'columns' && $rootScope.layoutMode!=='columns') ||
            (mode === 'rows' && $rootScope.layoutMode!=='rows')
        ) {
            networkActivityTracker.track(
                Setting.setViewlayout({ViewLayout: newLayout})
                .then(function(result) {
                        if (result.data && result.data.Code === 1000) {
                            notify({message: gettextCatalog.getString('Layout saved', null), classes: 'notification-success'});
                            $rootScope.mobileMode = false;
                            $rootScope.layoutMode = mode;
                            authentication.user.ViewLayout = newLayout;
                            $scope.mobileResponsive();
                        } else if (result.data && result.data.Error) {
                            notify({message: result.data.Error, classes: 'notification-danger'});
                        } else {
                            notify({message: 'Error during saving layout mode', classes: 'notification-danger'});
                        }
                    }
                )
            );
        }

        angular.element('#pm_toolbar-desktop a').tooltip('hide');
    };

    /**
     * Check if the current message is a draft
     * @param {Object} element
     * @return {Boolean}
     */
    $scope.draft = function(element) {
        return angular.isDefined(element.LabelIDs) && element.LabelIDs.indexOf(CONSTANTS.MAILBOX_IDENTIFIERS.drafts) !== -1;
    };

    /**
     * Close all label dropdown
     */
    $scope.closeLabels = function() {
        $('.pm_dropdown').removeClass('active');
    };

    /**
     * Emulate labels array for the drag and drop
     * @param {String} labelID
     */
    $scope.applyLabels = function(labelID) {
        var labels = [];

        _.each($scope.labels, function(label) {
            if(label.ID === labelID) {
                label.Selected = true;
            }

            labels.push(label);
        });

        $scope.saveLabels(labels, true);
    };

    // Used for mobile
    $scope.next = function() {
        $scope.goToPage( $scope.page + 1 );
    };

    $scope.previous = function() {
        if ( $scope.page > 1 ) {
            $scope.goToPage( $scope.page - 1 );
        }
    };

    /**
     * Switch to an other page
     * @param {Integer} page
     */
    $scope.goToPage = function(page) {
        var route = 'secured.' + $scope.mailbox;

        $scope.unselectAllElements();
        $scope.page = page;

        if (page > 0 && $scope.conversationCount() > ((page - 1) * $scope.conversationsPerPage)) {
            if (page === 1) {
                page = undefined;
            }

            $state.go(route, _.extend({}, $state.params, {
                page: page,
                id: undefined
            }));
        }
    };

    /**
     * Toggle star
     * @param {Object} element - conversation or message
     */
    $scope.toggleStar = function(element) {
        if ($scope.starred(element) === true) {
            $scope.unstar(element);
        } else {
            $scope.star(element);
        }
    };

    /**
     * Star conversation or message
     * @param {Object} element
     */
    $scope.star = function(element) {
        var type = tools.typeList();

        if (type === 'conversation') {
            action.starConversation(element.ID);
        } else if(type === 'message') {
            action.starMessage(element.ID);
        }
    };

    /**
     * Unstar conversation or message
     * @param {Object} element
     */
    $scope.unstar = function(element) {
        var type = tools.typeList();

        if(type === 'conversation') {
            action.unstarConversation(element.ID);
        } else if(type === 'message') {
            action.unstarMessage(element.ID);
        }
    };

    /**
     * Check in LabelIDs to see if the conversation or message is starred
     * @param {Object} element
     */
    $scope.starred = function(element) {
        if(element.LabelIDs.indexOf(CONSTANTS.MAILBOX_IDENTIFIERS.starred) !== -1) {
            return true;
        } else {
            return false;
        }
    };

    /**
     * Return label object
     * @param {String} id
     */
    $scope.getLabel = function(id) {
        return _.findWhere(authentication.user.Labels, {ID: id});
    };

    /**
     * Return style for label element
     * @param {String} id
     */
    $scope.getStyleLabel = function(id) {
        var color = $scope.getLabel(id).Color;

        return {
            border: '2px solid ' +  color,
            color: color
        };
    };

    /**
     * Go to label folder + reset parameters
     * @param {String} labelID
     */
    $scope.goToLabel = function(labelID) {
        var params = {page: undefined, filter: undefined, sort: undefined, label: labelID};

        $state.go('secured.label', params);
    };

    /**
     * On click on a conversation
     * @param {Object} element - Conversation or Message
     */
    $scope.click = function(element) {
        var type = tools.typeList();
        var params = {};

        // Save scroll position
        $rootScope.scrollPosition = $('#content').scrollTop();
        // Unselect all elements
        $scope.unselectAllElements();
        // Mark this element
        $scope.markedConversation = element;
        // Open conversation
        if(type === 'conversation') {
            params.id = element.ID;
        } else if (type === 'message') {
            params.id = element.ConversationID;
            params.message = element.ID;
        }

        $state.go('secured.' + $scope.mailbox + '.view', params);

        if(params.id === $stateParams.id) {
            $rootScope.$broadcast('initMessage', params.message, true);
        }
    };

    /**
     * On select a conversation
     * @param {Object} event
     * @param {Object} conversation
     */
    $scope.select = function(event, conversation) {
        $rootScope.showWelcome = false;

        if(!lastChecked) {
            lastChecked = conversation;
        } else {
            if (event.shiftKey) {
                var start = _.indexOf($scope.conversations, conversation);
                var end = _.indexOf($scope.conversations, lastChecked);

                _.each($scope.conversations.slice(Math.min(start, end), Math.max(start, end) + 1), function(conversation) {
                    conversation.Selected = lastChecked.Selected;
                });
            }

            lastChecked = conversation;
        }
    };

    /**
     * Select conversations by read or unread
     * @param {Boolean} isRead
     */
    $scope.selectReadOrUnread = function(isRead) {
      _.each($scope.conversations, function(element) {
          if(isRead) {
              element.Selected = element.NumUnread === 0 || element.IsRead === 1;
          }
          else {
              element.Selected = element.NumUnread > 0 || element.IsRead === 0;
          }
      });
    };

    /**
     * Filter current list
     * @param {String}
     */
    $scope.filterBy = function(status) {
        $state.go($state.$current.name, _.extend({}, $state.params, {
            filter: status,
            page: undefined
        }));
    };

    /**
     * Clear current filter
     */
    $scope.clearFilter = function() {
        $state.go($state.$current.name, _.extend({}, $state.params, {
            filter: undefined,
            page: undefined
        }));
    };

    /**
     * Order the list by a specific parameter
     * @param {String} criterion
     */
    $scope.orderBy = function(criterion) {
        if(criterion === '-date') {
            criterion = undefined;
        }

        $state.go($state.$current.name, _.extend({}, $state.params, {
            sort: criterion,
            page: undefined
        }));
    };

    /**
     * Empty specific location
     * @param {String} mailbox
     */
    $scope.empty = function(mailbox) {
        var title = gettextCatalog.getString('Confirmation', null, 'Title');
        var message = gettextCatalog.getString('Are you sure?', null, 'Info') + ' ' + gettextCatalog.getString('This cannot be undone.', null);
        var promise;

        if(['drafts', 'spam', 'trash'].indexOf(mailbox) !== -1) {
            confirmModal.activate({
                params: {
                    title: title,
                    message: message,
                    confirm: function() {
                        if (mailbox === 'drafts') {
                            promise = Message.emptyDraft().$promise;
                        } else if (mailbox === 'spam') {
                            promise = Message.emptySpam().$promise;
                        } else if (mailbox === 'trash') {
                            promise = Message.emptyTrash().$promise;
                        }

                        networkActivityTracker.track(
                            promise.then(function(response) {
                                if (response.Code === 1000) {
                                    // Call to empty cache conversation
                                    cache.empty(mailbox);
                                    // Close modal
                                    confirmModal.deactivate();
                                    // Notify user
                                    notify({message: gettextCatalog.getString('Folder emptied', null), classes: 'notification-success'});
                                    // Call event manager to update the storage space
                                    eventManager.call();
                                }
                            })
                        );
                    },
                    cancel: function() {
                        confirmModal.deactivate();
                    }
                }
            });
        }
    };

    // Call initialization
    $scope.initialization();
});
