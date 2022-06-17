import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'

import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'


export interface ServiceSampleProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  ecr: ecr.IRepository;
  albTargetGroup: elbv2.IApplicationTargetGroup;
}

export class ServiceSample extends cdk.Stack {
  public readonly service: ecs.FargateService

  constructor(scope: Construct, id: string, props: ServiceSampleProps) {
    super(scope, id, props)

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'taskDef', {
      cpu: 256,
      memoryLimitMiB: 512
    })
    const container = taskDefinition.addContainer('myContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecr, 'latest'),
    })

    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP
    })

    this.service = new ecs.FargateService(this, 'service', {
      cluster: props.cluster,
      taskDefinition,
      assignPublicIp: true, // Needed to retrieve docker image from registry
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    })

    // Attach service to the alb target
    this.service.attachToApplicationTargetGroup(props.albTargetGroup)
  }
}