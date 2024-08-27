/**
 * client.js
 */

const util = require('util');

const fins = require('omron-fins');


let variables = {};

module.exports = {
  conn: {},
  varChan: {},
  variables: {},

  init(plugin) {
    this.plugin = plugin;
    const options = { timeout: 5000, max_queue: 2, protocol: 'tcp' }
    this.conn = fins.FinsClient(Number(this.plugin.params.data.port), this.plugin.params.data.host, options, false);
  },


  addItems(arr) {
    const numsAndStringsSort = (a, b) => a.address.localeCompare(b.address, 'en', { numeric: true });
    const sortedArr = arr.sort(numsAndStringsSort);
    let cnt = 0;
    let index = 0 
    for(i=0; i<sortedArr.length; i++) {
      let item = sortedArr[i];
      if (this.variables[index] == undefined) this.variables[index] = [];
      if (this.varChan[index] == undefined) this.varChan[index] = [];
      if (cnt == 50) {
        this.variables[index].push(item.address);
        this.varChan[index].push({id: item.id, title: item.chan});
        cnt = 0;
        index++;
      } else {
        cnt++;
        this.variables[index].push(item.address);
        this.varChan[index].push({id: item.id, title: item.chan});
      }
    }  
  },

  removeItems(i, j) {
    this.variables[i].splice(j, 1);  
    this.varChan[i].splice(j, 1);
  },

  async connect() {
    const host = this.plugin.params.data.host;
    const port = Number(this.plugin.params.data.port);

    this.plugin.log('Try connect to ' + host + ':' + port);
    
    return new Promise((resolve, reject) => {
      this.conn.connect();
      this.conn.on('open', function (info) {
        resolve(info);
      });
      this.conn.on('error', function (error, msg) {
        reject(error);
      });
      this.conn.on('timeout', function (host, msg) {
        reject(host + " timeout");
      });

    });
  },

  readAll(channels, ids) {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(resTimeout.bind(this), this.plugin.params.data.timeout);
      /*this.conn.readMultiple(channels, function(err) {
        if (err) reject({ message: err});
      }, ids)*/
      this.conn.readMultiple(channels, null, ids)
      this.conn.on('reply', function getData(msg) {
        this.removeListener('data', getData);
        clearTimeout(timerId);
        resolve(msg);
      });
      function resTimeout() {
        this.plugin.log("Timeout");
        reject({ message: 'Timeout: ' + this.plugin.params.data.timeout });
      } 
    });
  },

  write(items, values) {
    return new Promise((resolve, reject) => {
      this.conn.write(items, values, (err, msg )=> {
        if (err) {
          reject(err);
        } else {
          resolve(msg);
        }
      });
    });
  },

  close() {
    return new Promise((resolve, reject) => {
      this.conn.disconnect();
      this.conn.on('close', function (info) {
        resolve();
      });
    });
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
