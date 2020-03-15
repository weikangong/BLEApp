// @flow

import React, {Component} from 'react';
import {connect as reduxConnect} from 'react-redux';
import moment from 'moment';
import {
  StyleSheet,
  Text,
  SafeAreaView,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  StatusBar,
  TextInput
} from 'react-native';
import {
  type ReduxState,
  clearLogs,
  connect,
  disconnect,
  executeTest,
  forgetSensorTag,
  ConnectionState,
} from './Reducer';
import { Device, BleManager } from 'react-native-ble-plx';
import { SensorTagTests, type SensorTagTestMetadata } from './Tests';
import RNFS from 'react-native-fs';

const FILE_DIRECTORY = `${RNFS.ExternalStorageDirectoryPath}/Download/`;
const FILE_NAME = 'data.csv';
const IBEACON_MANUFACTURER_DATA = 'TAACFQAFAAEAABAAgAAAgF+bATEABmd4ww==';
const NUM_SENSORS = 16;
const TIME_INTERVAL = '2000'; // In milliseconds
// Init empty csv row on each collectData
const EMPTY_CSV_DATA_ROW = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// Map device id to arr index
const DEVICE_ID_MAP = Object.freeze({
  '00:A0:50:12:24:2E': 1,
  '00:A0:50:07:1A:2E': 2,
  '00:A0:50:18:0F:1F': 3,
  '00:A0:50:03:1F:33': 4,
  '00:A0:50:07:2B:2C': 5,
  '00:A0:50:06:11:17': 6,
  '00:A0:50:13:17:2B': 7,
  '00:A0:50:08:28:1F': 8,
  '00:A0:50:12:1F:27': 9,
});

const Button = function(props) {
  const {onPress, title, ...restProps} = props;
  return (
    <TouchableOpacity onPress={onPress} {...restProps}>
      <Text
        style={[
          styles.buttonStyle,
          restProps.disabled ? styles.disabledButtonStyle : null,
        ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

type Props = {
  sensorTag: ?Device,
  connectionState: $Keys<typeof ConnectionState>,
  logs: Array<string>,
  clearLogs: typeof clearLogs,
  connect: typeof connect,
  disconnect: typeof disconnect,
  executeTest: typeof executeTest,
  currentTest: ?string,
  forgetSensorTag: typeof forgetSensorTag,
};

type State = {
  showModal: boolean,
};

class SensorTag extends Component<Props, State> {

  constructor(props: Props) {
    super(props);
    this.manager = new BleManager();
    this.state = {
      label: '',
      isBluetoothOn: false,
      showModal: false,
      logs: [],
      startScan: false,
      interval: TIME_INTERVAL,
      fileName: FILE_NAME,
    };
    this.startScanTime = 0;
    this.csvDataRow = EMPTY_CSV_DATA_ROW,
    this.deviceSet = new Set(); // Use to get num sensors read
  }

  updateLogs = (log: string): void => {
    const logs = [...this.state.logs];
    logs.push(log);
    this.setState({ logs });
  };

  scanAndStoreRSSI = async () => {
    this.updateLogs('Scanning started...');

    await this.manager.startDeviceScan(null, null, (error, device) => {
        if (!this.state.startScan) {
          this.setState({ startScan: true });
          this.startScanTime = Date.now();
          setTimeout(this.stopScanAndSave, this.state.interval-0);
        }

        if (error) return;
        if (this.deviceSet.size === NUM_SENSORS) return;

        // Sensor is iBeacon
        if (device.manufacturerData && IBEACON_MANUFACTURER_DATA.substr(0,16) === device.manufacturerData.substr(0,16)) {
          console.log('device id matched', device.id, device.rssi, DEVICE_ID_MAP[device.id]);
          this.deviceSet.add(device.id);

          // If device id mapping exists,
          // get mapped index and set rssi value in csvDataRow
          if (DEVICE_ID_MAP[device.id]) {
            this.csvDataRow[DEVICE_ID_MAP[device.id]] = device.rssi;
          }
        }
    });
  }

  stopScanAndSave = async () => {
    this.manager.stopDeviceScan();

    this.csvDataRow[0] = Date.now();
    this.csvDataRow[this.csvDataRow.length-1] = this.state.label;

    this.updateLogs(`Scanning stopped, took ${Date.now()-this.startScanTime} ms`);
    this.updateLogs(`CSV Data Row:\n ${this.csvDataRow}`);

    await this.saveToFile();


    // Reset data
    this.setState({ startScan: false });
    this.deviceSet = new Set();
    this.csvDataRow = EMPTY_CSV_DATA_ROW;
  }

  clearLogs = () => {
    this.setState({ logs: [] });
  }

  saveToFile = async () => {
    try {
      let fileContent = await RNFS.readFile(FILE_DIRECTORY+this.state.fileName, 'utf8');
      console.log('saveToFile', this.state.fileName, fileContent);
      fileContent += `\n${this.csvDataRow}`;
      await RNFS.writeFile(FILE_DIRECTORY+this.state.fileName, fileContent, 'utf8');
    } catch {
      const idHeaders = Object.keys(DEVICE_ID_MAP);
      const headers = `${['timestamp', ...idHeaders, 'label'].join(',')}\n`;
      const fileContent = headers+`${this.csvDataRow.join(',')}`;

      await RNFS.writeFile(FILE_DIRECTORY+this.state.fileName, fileContent, 'utf8');
    }

  }

  renderLogs() {
    return (
      <View style={{flex: 1, padding: 10, paddingTop: 0}}>
        <FlatList
          style={{flex: 1}}
          data={this.state.logs}
          renderItem={({item}) => (
            <Text style={styles.logTextStyle}> {item} </Text>
          )}
          keyExtractor={(item, index) => index.toString()}
        />
        <Button
          style={{ paddingTop: 10 }}
          onPress={this.clearLogs}
          title={'Clear logs'}
        />
      </View>
    );
  }

  renderModal() {
    // $FlowFixMe: SensorTagTests are keeping SensorTagTestMetadata as values.
    const tests: Array<SensorTagTestMetadata> = Object.values(SensorTagTests);

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={this.state.showModal}
        onRequestClose={() => {}}>
        <View
          style={{
            backgroundColor: '#00000060',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              backgroundColor: '#a92a35',
              borderRadius: 10,
              height: '50%',
              padding: 5,
              shadowColor: 'black',
              shadowRadius: 20,
              shadowOpacity: 0.9,
              elevation: 20,
            }}>
            <Text
              style={[
                styles.textStyle,
                {paddingBottom: 10, alignSelf: 'center'},
              ]}>
              Select test to execute:
            </Text>
            <FlatList
              data={tests}
              renderItem={({item}) => (
                <Button
                  style={{paddingBottom: 5}}
                  disabled={!this.isSensorTagReadyToExecuteTests()}
                  onPress={() => {
                    this.props.executeTest(item.id);
                    this.setState({showModal: false});
                  }}
                  title={item.title}
                />
              )}
              keyExtractor={(item, index) => index.toString()}
            />
            <Button
              style={{paddingTop: 5}}
              onPress={() => {
                this.setState({showModal: false});
              }}
              title={'Cancel'}
            />
          </View>
        </View>
      </Modal>
    );
  }

  collectData = () => {
    const subscription = this.manager.onStateChange((state) => {
        if (state === 'PoweredOn') {
            this.scanAndStoreRSSI();
            subscription.remove();
            this.setState({ isBluetoothOn: true });
        } else {
          this.setState({ isBluetoothOn: false });
        }
    }, true);
  }

  changeText = (key: string, text: string): void => {
    this.setState({ [key]: text });
  }

  renderHeader = (): React.Node => (
    <View>
      <Text style={styles.header}>Bluetooth Status: {this.state.isBluetoothOn ? 'ON' : 'OFF'}</Text>
      <Text style={styles.subheader}>Current interval: {this.state.interval} ms, saving to {this.state.fileName}</Text>
    </View>
  );

  renderLabelInput = (): React.Node => {
    return (
      <View>
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>Label:</Text>
          <TextInput
            style={styles.labelTextInput}
            onChangeText={(text) => this.changeText('label', text)}
            value={this.state.label}
          />
          <Text style={styles.labelText}>Interval:</Text>
          <TextInput
            style={styles.labelTextInput}
            onChangeText={(text) => this.changeText('interval', text)}
            value={this.state.interval}
          />
        </View>
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>File Name:</Text>
          <TextInput
            style={styles.labelTextInput}
            onChangeText={(text) => this.changeText('fileName', text)}
            value={this.state.fileName}
          />
          <Button
            style={{ margin: 5, borderRadius: 20 }}
            disabled={this.state.startScan}
            onPress={this.collectData}
            title={'Start'}
          />
        </View>
    </View>);
  }

  render() {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#3240a8" />
        {this.renderHeader()}
        {this.renderLabelInput()}
        {this.renderLogs()}
        {this.renderModal()}
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 5,
  },
  header: {
    alignSelf: 'center',
    fontSize: 20,
    marginTop: 10
  },
  subheader: {
    alignSelf: 'center',
    fontSize: 14,
    margin: 10
  },
  textStyle: {
    color: 'white',
    fontSize: 20,
  },
  logTextStyle: {
    fontSize: 15,
  },
  buttonStyle: {
    borderRadius: 5,
    padding: 5,
    backgroundColor: '#3487eb', //button colour
    color: 'white',
    textAlign: 'center',
    fontSize: 18,
    borderRadius: 10
  },
  disabledButtonStyle: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  labelText: {
    padding: 5,
    alignSelf: 'center'
  },
  labelTextInput: {
    flex: 1,
    height: 40,
    padding: 10,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  labelRow: {
    flexDirection: 'row',
    margin: 5,
    justifyContent: 'center'
  }
});

export default reduxConnect(
  (state: ReduxState): $Shape<Props> => ({
    logs: state.logs,
    sensorTag: state.activeSensorTag,
    connectionState: state.connectionState,
    currentTest: state.currentTest,
  }),
  {
    clearLogs,
    connect,
    disconnect,
    forgetSensorTag,
    executeTest,
  },
)(SensorTag);
