import * as core from '@actions/core';
import axios from "axios";
import qs from "qs";

async function run(): Promise<void> {
  try {
    // Get inputs
    const domain = core.getInput('jenkins_domain', { required: true });
    const user = core.getInput('jenkins_user', { required: true });
    const token = core.getInput('jenkins_token', { required: true });
    const jobName = core.getInput('job_name', { required: true });
    const payload = core.getInput('payload', { required: true });
    const parsePayload = JSON.parse(payload);
    const isNeedTriggerStatus = core.getInput('is_need_trigger_status') === 'true';
    console.log(`Triggering Jenkins job: ${jobName} with payload:`, parsePayload);
    const url = `https://${domain}/${jobName}/buildWithParameters`;
    console.log(`Triggering Jenkins job at URL: ${url}`);
    const response = await axios.post(url, qs.stringify(parsePayload), {
      auth: {
        username: user,
        password: token
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log(`Triggered Jenkins job ${jobName} successfully:`, response.status );
    const triggeredJobLocationUrl = response.headers?.location;

    if (isNeedTriggerStatus && triggeredJobLocationUrl) {
      let buildNumber;
      while (!buildNumber) {
        const queueRes = await axios.get(triggeredJobLocationUrl + 'api/json', {
          auth: {
            username: user,
            password: token
          }
        });
        if (queueRes.data.executable) {
          buildNumber = queueRes.data.executable.number;
        } else if (queueRes.data.cancelled) {
          throw new Error('Build was cancelled');
        }
        await new Promise(r => setTimeout(r, 10000));
      }


      if (buildNumber) {
        const triggerUrl =  `${domain}/job/${jobName}/${buildNumber}/api/json`;
        let buildResult;
        let checkTimes = 0;
        console.log(`Waiting for Jenkins job ${jobName} build number ${buildNumber} to complete...`);
        // Polling for job status
        while (!buildResult && checkTimes < 30) {
          const jobStatusResponse = await axios.get(triggerUrl, {
            auth: {
              username: user,
              password: token
            }
          });
          if (!jobStatusResponse.data.building) {
            buildResult = jobStatusResponse.data.result;
          }
          checkTimes++;
          await new Promise(r => setTimeout(r, 50000));
        }
        if (checkTimes >= 30) {
          buildResult = 'TIMEOUT';
          console.error(`Jenkins job ${jobName} build number ${buildNumber} timed out after 30 checks.`);
        }

        const targetJob = 'Job: '+ jobName + ', Build ID: ' + buildNumber;
        console.log(`Triggered Jenkins job status:`, targetJob);
        if (buildResult === 'SUCCESS') {
          console.log('Build success', targetJob);
        } else if (buildResult === 'TIMEOUT') {
          throw new Error('Build timed out');
        } else {
          console.log('Build failed:', targetJob);
          throw new Error('Build failed');
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      console.error(`Error triggering Jenkins job: ${error.message}`);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
