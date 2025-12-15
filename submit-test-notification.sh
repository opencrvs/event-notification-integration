#!/bin/bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

#------------------------------------------------------------------------------------------------------------------
# By default OpenCRVS saves a backup of all data on a cron job every day in case of an emergency data loss incident
# This script downloads all the data based on --label (defaults to current day)
#------------------------------------------------------------------------------------------------------------------

set -e

for i in "$@"; do
  case $i in
  --client_id=*)
    CLIENT_ID="${i#*=}"
    shift
    ;;
  --client_secret=*)
    CLIENT_SECRET="${i#*=}"
    shift
    ;;
  --localhost=*)
    LOCALHOST="${i#*=}"
    shift
    ;;
  *) ;;
  esac
done

print_usage_and_exit() {
  echo 'Usage: ./submit-test-notification.sh --client_id=XXX --client_secret=XXX'
  exit 1
}

if [ -z "$CLIENT_ID" ] ; then
    echo 'Error: Argument for the --client_id is required.'
    print_usage_and_exit
fi

if [ -z "$CLIENT_SECRET" ]; then
  echo "Error: Argument for the --client_secret is required."
  print_usage_and_exit
fi

export CLIENT_ID
export CLIENT_SECRET
export LOCALHOST

yarn submit-test-notification