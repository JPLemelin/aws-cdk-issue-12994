#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { BaseInfraStack } from '../lib/base-infra-stack';
import { EcrStack } from '../lib/ecr-stack';
import { ServiceSample } from '../lib/service-sample';
import { ServiceSamplePatched } from '../lib/service-sample-patched';

const app = new cdk.App()

const envName = app.node.tryGetContext('envName')

if (!envName) {
  throw new Error('Error, you have to add context: envName')
}

const context = app.node.tryGetContext(envName)
const region: string = context.region
const accountId: string = context.accountId

const props = {
  env : {
    account: accountId,
    region: region
  } ,
  envName: envName,
  region: region,
}

const baseInfraStack = new BaseInfraStack(app, `baseInfra-${envName}`, {
    ...props,
})

const myEcr = new EcrStack(app, `ecr-${envName}`, {
  ...props,
  imageName: 'sample'
})

const serviceSample = new ServiceSample(app, `service-sample-${envName}`, {
  ...props,
  vpc: baseInfraStack.vpc,
  cluster: baseInfraStack.cluster,
  albTargetGroup: baseInfraStack.targetGroups['cognito-sample'],
  ecr: myEcr.ecr,
})

const serviceSampleWithoutCognito = new ServiceSample(app, `service-sample-without-cognito-${envName}`, {
  ...props,
  vpc: baseInfraStack.vpc,
  cluster: baseInfraStack.cluster,
  albTargetGroup: baseInfraStack.targetGroups['whitout-cognito-sample'],
  ecr: myEcr.ecr,
})

const serviceSamplePatched = new ServiceSamplePatched(app, `service-sample-patched-${envName}`, {
  ...props,
  vpc: baseInfraStack.vpc,
  cluster: baseInfraStack.cluster,
  albTargetGroup: baseInfraStack.targetGroups['cognito-sample-patched'],
  ecr: myEcr.ecr,
  albSG: baseInfraStack.albSG, // PATCH:  When using congito ALB Security Group will not be connected to Security Group of service  
})

