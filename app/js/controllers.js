'use strict';

function RootCtrl(state, $scope, $filter, $timeout, logFactory, modelSrvc, cometdSrvc, langSrvc, LANG, apiSrvc, ENUMS, EXTERNAL_URL, LANTERNUI_VER, $window) {
  var log = logFactory('RootCtrl'),
      model = $scope.model = modelSrvc.model,
      i18nFltr = $filter('i18n'),
      jsonFltr = $filter('json'),
      reportedStateFltr = $filter('reportedState'),
      MODE = ENUMS.MODE,
      CONNECTIVITY = ENUMS.CONNECTIVITY;
  $scope.modelSrvc = modelSrvc;
  $scope.cometdSrvc = cometdSrvc;
  $scope.lanternUiVersion = LANTERNUI_VER.join('.');
  $scope.state = state;
  // XXX for easier inspection in the JavaScript console
  $window.state = state;
  $window.model = model;
  $window.rootScope = $scope;
  $scope.EXTERNAL_URL = EXTERNAL_URL;
  angular.forEach(ENUMS, function(val, key) {
    $scope[key] = val;
  });

  $scope.lang = langSrvc.lang;
  $scope.direction = langSrvc.direction;
  $scope.LANG = LANG;

  $scope.$watch('model.dev', function(dev) {
    state.dev = dev;
  });

  $scope.$on('cometdConnected', function() {
    log.debug('cometdConnected');
    $scope.cometdConnected = true;
    $scope.$apply();
  });

  $scope.$on('cometdDisconnected', function () {
    log.debug('cometdDisconnected');
    $scope.cometdConnected = false;
    $scope.$apply();
  });

  $scope.defaultReportMsg = function() {
    var reportedState = jsonFltr(reportedStateFltr($scope.model));
    return i18nFltr('MESSAGE_PLACEHOLDER') + reportedState;
  };

  $scope.$watch('model.notifications', function(notifications) {
    _.each(notifications, function(notification, id) {
      if (notification.autoClose) {
        $timeout(function() {
          $scope.interaction(INTERACTION.close, {notification: id, auto: true});
        }, notification.autoClose * 1000);
      }
    });
  }, true);

  $scope.$watch('model.settings.mode', function(mode) {
    $scope.inGiveMode = mode === MODE.give;
    $scope.inGetMode = mode === MODE.get;
  }, true);

  $scope.$watch('model.mock', function(mock) {
    $scope.mockBackend = !!mock;
  }, true);


  $scope.$watch('model.location.country', function(country) {
    if (country && model.countries[country])
      $scope.inCensoringCountry = model.countries[country].censors;
  }, true);

  $scope.$watch('model.connectivity.gtalk', function(gtalk) {
    $scope.gtalkNotConnected = gtalk === CONNECTIVITY.notConnected;
    $scope.gtalkConnecting = gtalk === CONNECTIVITY.connecting;
    $scope.gtalkConnected = gtalk === CONNECTIVITY.connected;
  }, true);

  $scope.$watch('model.ninvites', function(ninvites) {
    $scope.ninvitesUnknown = ninvites === -1;
  }, true);

  $scope.reload = function() {
    location.reload(true); // true to bypass cache and force request to server
  };

  $scope.interaction = function(interactionid, extra) {
    return apiSrvc.interaction(interactionid, extra)
      .success(function(data, status, headers, config) {
        log.debug('interaction(', interactionid, extra || '', ') successful');
      })
      .error(function(data, status, headers, config) {
        log.error('interaction(', interactionid, extra, ') failed');
        apiSrvc.exception({data: data, status: status, headers: headers, config: config});
      });
  };

  $scope.changeSetting = function(key, val) {
    var update = {path: '/settings/'+key, value: val};
    return $scope.interaction(INTERACTION.set, update);
  };

  $scope.changeLang = function(lang) {
    return $scope.interaction(INTERACTION.changeLang, {lang: lang});
  };

  $scope.openExternal = function(url) {
    return $scope.interaction(INTERACTION.url, {url: url});
  };
}

function SettingsLoadFailureCtrl($scope, MODAL) {
  $scope.show = false;
  $scope.$watch('model.modal', function(modal) {
    $scope.show = modal === MODAL.settingsLoadFailure;
  });
}

function UnexpectedStateCtrl($scope, $filter, cometdSrvc, apiSrvc, modelSrvc, MODAL, REQUIRED_API_VER, INTERACTION, logFactory) {
  var log = logFactory('UnexpectedStateCtrl');

  $scope.modelSrvc = modelSrvc;

  $scope.show = false;
  $scope.$watch('modelSrvc.sane', function(sane) {
    if (!sane) {
      // disconnect immediately from insane backend
      cometdSrvc.disconnect();
      $scope.report = $scope.defaultReportMsg();
      modelSrvc.model.modal = MODAL.none;
      $scope.show = true;
    }
  }, true);

  $scope.$watch('model.version.installed.api', function(installed) {
    if (angular.isUndefined(installed)) return;
    for (var key in {major: 'major', minor: 'minor'}) {
      if (installed[key] !== REQUIRED_API_VER[key]) {
        log.error('Backend api version', installed, 'incompatible with required version', REQUIRED_API_VER);
        // XXX this might well 404 due to the version mismatch but worth a shot?
        apiSrvc.exception({error: 'versionMismatch', installed: installed, required: REQUIRED_API_VER});
        modelSrvc.sane = false;
        return;
      }
    }
  }, true);

  function handleChoice(choice) {
    $scope.interaction(choice, {notify: $scope.notify, report: $scope.report}).then($scope.reload);
  }
  $scope.handleReset = function() {
    handleChoice(INTERACTION.unexpectedStateReset);
  };
  $scope.handleRefresh = function() {
    handleChoice(INTERACTION.unexpectedStateRefresh);
  };
}

function RequestInviteCtrl($scope, logFactory, MODAL, INTERACTION) {
  var log = logFactory('RequestInviteCtrl');

  $scope.sendToLanternDevs = false;
  $scope.disableForm = false;
  $scope.submitButtonLabelKey = 'SEND_REQUEST';

  function resetForm() {
    $scope.disableForm = false;
    $scope.submitButtonLabelKey = 'SEND_REQUEST';
  }

  $scope.requestInvite = function() {
    $scope.disableForm = true;
    $scope.requestError = false;
    $scope.submitButtonLabelKey = 'SENDING_REQUEST';
    var params = {lanternDevs: $scope.sendToLanternDevs};
    return $scope.interaction(INTERACTION.requestInvite, params) // XXX TODO
      .then(resetForm, function() { $scope.requestError = true; });
  };
}

function SystemProxyCtrl($scope, logFactory, MODAL, SETTING, INTERACTION) {
  var log = logFactory('SystemProxyCtrl'),
      path = '/settings/'+SETTING.systemProxy;

  $scope.systemProxy = true;
  $scope.disableForm = false;
  $scope.submitButtonLabelKey = 'CONTINUE';

  $scope.$watch('model.settings.systemProxy', function(systemProxy) {
    if (_.isBoolean(systemProxy)) $scope.systemProxy = systemProxy;
  });

  function resetForm() {
    $scope.disableForm = false;
    $scope.submitButtonLabelKey = 'CONTINUE';
  }

  $scope.continue = function() {
    $scope.sysproxyError = false;
    $scope.disableForm = true;
    $scope.submitButtonLabelKey = 'CONFIGURING';
    $scope.interaction(INTERACTION.continue, {path: path, value: $scope.systemProxy})
      .then(resetForm, resetForm);
  };
}

function ContactCtrl($scope, MODAL, $filter, CONTACT_FORM_MAXLEN) {
  $scope.CONTACT_FORM_MAXLEN = CONTACT_FORM_MAXLEN;

  $scope.show = false;
  $scope.$watch('model.modal', function(modal) {
    $scope.show = modal === MODAL.contact;
    if ($scope.show) {
      $scope.message = $scope.defaultReportMsg();
      if ($scope.contactForm && $scope.contactForm.contactMsg) {
        $scope.contactForm.contactMsg.$pristine = true;
      }
    }
  }, true);
}

function SettingsCtrl($scope, $timeout, modelSrvc, logFactory, MODAL) {
  var log = logFactory('SettingsCtrl');

  $scope.$watch('model.settings.runAtSystemStart', function(runAtSystemStart) {
    $scope.runAtSystemStart = runAtSystemStart;
  }, true);

  $scope.$watch('model.settings.autoReport', function(autoReport) {
    $scope.autoReport = autoReport;
  }, true);

  $scope.$watch('model.settings.systemProxy', function(systemProxy) {
    $scope.systemProxy = systemProxy;
  }, true);

  $scope.$watch('model.settings.proxyAllSites', function(proxyAllSites) {
    $scope.proxyAllSites = proxyAllSites;
  }, true);
}

function ProxiedSitesCtrl($scope, $timeout, $filter, logFactory, MODAL, SETTING, INTERACTION, INPUT_PAT) {
  var log = logFactory('ProxiedSitesCtrl'),
      fltr = $filter('filter'),
      DOMAIN = INPUT_PAT.DOMAIN,
      IPV4 = INPUT_PAT.IPV4,
      nproxiedSitesMax = 1000,
      proxiedSites = [],
      proxiedSitesDirty = [];

  $scope.$watch('model.modal', function(modal) {
    $scope.show = modal === MODAL.proxiedSites;
  });

  $scope.$watch('searchText', function(searchText) {
    $scope.inputFiltered = (searchText ? fltr(proxiedSitesDirty, searchText) : proxiedSitesDirty).join('\n');
  });

  function updateComplete() {
    $scope.hasUpdate = false;
    $scope.updating = false;
  }

  function makeValid() {
    $scope.errorLabelKey = '';
    $scope.errorCause = '';
    if ($scope.proxiedSitesForm && $scope.proxiedSitesForm.input) {
      $scope.proxiedSitesForm.input.$setValidity('generic', true);
    }
  }

  $scope.$watch('model.settings.proxiedSites', function(proxiedSites_) {
    if (proxiedSites) {
      proxiedSites = normalizedLines(proxiedSites_);
      $scope.input = proxiedSites.join('\n');
      updateComplete();
      makeValid();
      proxiedSitesDirty = _.cloneDeep(proxiedSites);
    }
  }, true);
  $scope.$watch('model.nproxiedSitesMax', function(nproxiedSitesMax_) {
    nproxiedSitesMax = nproxiedSitesMax_;
    if ($scope.input)
      $scope.validate($scope.input);
  }, true);

  function normalizedLine(domainOrIP) {
    return angular.lowercase(domainOrIP.trim());
  }

  function normalizedLines(lines) {
    return _.map(lines, normalizedLine);
  }

  $scope.validate = function(value) {
    if (!value || !value.length) {
      $scope.errorLabelKey = 'ERROR_ONE_REQUIRED';
      $scope.errorCause = '';
      return false;
    }
    if (angular.isString(value)) value = value.split('\n');
    proxiedSitesDirty = [];
    var uniq = {};
    $scope.errorLabelKey = '';
    $scope.errorCause = '';
    for (var i=0, line=value[i], l=value.length, normline;
         i<l && !$scope.errorLabelKey;
         line=value[++i]) {
      normline = normalizedLine(line);
      if (!normline) continue;
      if (!(DOMAIN.test(normline) ||
            IPV4.test(normline))) {
        $scope.errorLabelKey = 'ERROR_INVALID_LINE';
        $scope.errorCause = line;
      } else if (!(normline in uniq)) {
        proxiedSitesDirty.push(normline);
        uniq[normline] = true;
      }
    }
    if (proxiedSitesDirty.length > nproxiedSitesMax) {
      $scope.errorLabelKey = 'ERROR_MAX_PROXIED_SITES_EXCEEDED';
      $scope.errorCause = '';
    }
    $scope.hasUpdate = !_.isEqual(proxiedSites, proxiedSitesDirty);
    return !$scope.errorLabelKey;
  };

  $scope.handleReset = function() {
    $scope.input = proxiedSites.join('\n');
    makeValid();
  };

  $scope.handleContinue = function() {
    if ($scope.proxiedSitesForm.$invalid) {
      log.debug('invalid input, not sending update');
      return $scope.interaction(INTERACTION.continue);
    }
    if (!$scope.hasUpdate) {
      log.debug('input matches original, not sending update');
      return $scope.interaction(INTERACTION.continue);
    }
    log.debug('sending update');
    $scope.input = proxiedSitesDirty.join('\n');
    $scope.updating = true;
    $scope.changeSetting(SETTING.proxiedSites, proxiedSitesDirty).then(function() {
      updateComplete();
      log.debug('update complete, sending continue');
      $scope.interaction(INTERACTION.continue);
    }, function() {
      $scope.updating = false;
      $scope.errorLabelKey = 'ERROR_SETTING_PROXIED_SITES';
      $scope.errorCause = '';
    });
  };
}

function LanternFriendsCtrl($timeout, $scope, modelSrvc, logFactory, MODE, MODAL, $filter, INPUT_PAT, INTERACTION) {
  var log = logFactory('LanternFriendsCtrl'),
      model = modelSrvc.model,
      prettyUser = $filter('prettyUser'),
      EMAIL = INPUT_PAT.EMAIL,
      addedEmailsModel = [];

  $scope.$watch('added', function(added) {
    var addedEmailsScope = _.pluck(added, 'email');
    if (!_.isEqual(addedEmailsModel, addedEmailsScope)) {
      $scope.interaction(INTERACTION.friendsChanged, added);
    }
  }, true);

  $scope.$watch('model.friends.added', function(added) {
    if (!added) return;
    $scope.added = _.map(added, function(i) {
      return _.merge({id: i.email, text: prettyUser(i)}, i);
    });
    addedEmailsModel = _.pluck(added, 'email');
    updateCompletions();
  }, true);

  function updateCompletions() {
    if (!model.roster) return;
    var completions =
      _(model.roster)
      .filter(function(i) {
        return !_.contains(addedEmailsModel, i.email);
      })
      .map(function(i) {
        return _.merge({id: i.email, text: prettyUser(i)}, i);
      })
      .value();
    angular.copy(completions, $scope.select2Options.tags);
  }

  $scope.$watch('model.roster', function(roster) {
    if (!roster) return;
    updateCompletions();
  }, true);

  var resultTmpl = _.template(
    '<div class="invitee vcard">'+
      '<img class="photo" src="${picture}">'+
      '<div class="with-ellipsis">${text}</div>'+
    '</div>'
  );
  function formatResult(result) {
    if (!result.picture) result.picture = 'img/default-avatar.png'; // XXX don't hard-code
    return resultTmpl(result);
  }

  $scope.select2Options = {
    tags: [],
    tokenSeparators: [','],
    multiple: true,
  //selectOnBlur: true, // requires select2 3.3
    formatSearching: function() {
      return $filter('i18n')('SEARCHING_ELLIPSIS');
    },
    formatNoMatches: function() {
      return $filter('i18n')('ENTER_VALID_EMAIL');
    },
    formatSelection: formatResult,
    formatResult: formatResult,
    closeOnSelect: false,
    createSearchChoice: function(input) {
      return EMAIL.test(input) ? {id: input, text: input} : undefined;
    }
  };

  $scope.valid = function() {
    /*
    var added = $scope.added;
    if (!added) return true;
    if (!('length' in added)) return false;
    for (var i=0, ii=added[i]; ii; ii=added[++i]) {
      if (!EMAIL.test(ii.id)) return false;
    }
    */
    return true;
  };
}

function ScenariosCtrl($scope, $timeout, logFactory, modelSrvc, MODAL, INTERACTION) {
  var log = logFactory('ScenariosCtrl'),
      model = modelSrvc.model;

  $scope.$watch('model.mock.scenarios.applied', function(applied) {
    if (applied) {
      // XXX ui-select2 timing issue
      $timeout(function() {
        $scope.appliedScenarios = [];
        for (var group in applied) {
          $scope.appliedScenarios.push(group+'.'+applied[group]);
        }
      });
    }
  }, true);

  $scope.submit = function() {
    var appliedScenarios = {};
    for (var i=0, ii=$scope.appliedScenarios[i]; ii; ii=$scope.appliedScenarios[++i]) {
      var group_key_pair = ii.split('.');
      appliedScenarios[group_key_pair[0]] = group_key_pair[1];
    }
    $scope.interaction(INTERACTION.continue, {path: 'mock.scenarios.applied', value: appliedScenarios});
  };
}
