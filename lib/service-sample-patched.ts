import * as cdk from '@aws-cdk/core'

import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs'
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'


export interface ServiceSamplePatchedProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  ecr: ecr.IRepository;
  albTargetGroup: elbv2.IApplicationTargetGroup;

  // PATCH:  When using congito ALB Security Group will not be connected to Security Group of service  
  albSG: ec2.ISecurityGroup;
}

export class ServiceSamplePatched extends cdk.Stack {
  public readonly service: ecs.FargateService

  constructor(scope: cdk.Construct, id: string, props: ServiceSamplePatchedProps) {
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
 
    // PATCH:  When using congito ALB Security Group will not be connected to Security Group of service  
    this.service.connections.allowFrom(props.albSG, ec2.Port.tcp(80), 'CDK Bug #12994 - Connect service with ALB see: https://github.com/aws/aws-cdk/issues/12994')
  }
}